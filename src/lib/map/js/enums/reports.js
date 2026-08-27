/*globals gpAjax, GPWindowMgr, Layout */
(function() {
	'use strict';

	var Reports = {
		folder_id: null,

		markAll: function (status) {
			//@todo scope it!
			$("div.reports_date INPUT[type='checkbox']").prop('checked', status);
		},

		markAllResourceTransportReports: function (status) {
			//@todo scope it!
			$("td.resource_transport_reports_date INPUT[type='checkbox']").prop('checked', status);
		},

		toggleMenu: function () {
			var folder_menu_messages = $("#folder_menu_reports"), //@todo scope it!
				folders = folder_menu_messages.find(".hor_scrollbar_cont span.folder"),
				folders_len = folders.length,
				row = 1,
				per_row = Math.ceil(folders_len / 3),
				size = 0,
				sizes = [0, 0, 0];

			folder_menu_messages.toggle();

			//Find the biggest row size
			folders.each(function (index, obj) {
				if (index + 1 >= row * per_row && row < 3) {
					sizes[row - 1] = size;
					size = 0;
					row++;
				}

				size += $(this).outerWidth();

				if (index === folders_len - 1) {
					sizes[row - 1] = size;
				}
			});

			//@todo scope it!
			$("#folder_menu_reports .hor_scrollbar_cont").width(Math.max(sizes[0], sizes[1], sizes[2]));
			//@todo scope it!
			$("#report_list").toggleClass('with_menu');
		},

		editFolder: function (folder_id) {
			Reports.folder_id = folder_id;

			var params = {folder_id: folder_id};

			//@todo scope it!
			$('#report_folder #folder_name_' + folder_id).css('display', 'block');
			$('#report_folder #save_folder_name_' + folder_id).css('display', 'block');
			$('#report_folder #folder_link_' + folder_id).css('display', 'none');

			gpAjax.ajaxGet('report', 'getFolder', params, true, function (data) {
				//@todo scope it!
				$('#report_folder #folder_name_' + folder_id).val(data.folder.name);
			});

			return false;
		},

		saveFolder: function () {
			var params = {folder_id: Reports.folder_id, name: $('#report_folder #folder_name_' + Reports.folder_id).val()};
			GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_REPORT).requestContentPost('report', 'saveFolder', params);
		},

		newFolder: function () {
			var params = {folder_id: false, name: $('#report_folder #new_folder_name').val()};
			GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_REPORT).requestContentPost('report', 'saveFolder', params);
		},

		delFolder: function (folder_id) {
			var params = {folder_id: folder_id};
			GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_REPORT).requestContentPost('report', 'delFolder', params);
		},

		/**
		 * Shows a dialog to publish a report. Create dialog and assign click handlers.
		 *
		 * @param report_id integer id of report to show publication dialog for
		 */
        publishReportDialog: function (report_id) {
            var wnd = GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_PUBLISH_REPORT),
				UIOpts = {report_id: report_id};

            if (!wnd) {
                GPWindowMgr.Create(GPWindowMgr.TYPE_PUBLISH_REPORT, _('Publish report'), UIOpts);
            } else {
                wnd.getHandler().onInit(_('Publish report'), UIOpts);
                wnd.toTop();
            }

            return false;
        },

        /**
		 * Show the publish report dialog and assigns click handlers.
		 * Gets the result of trying to open the publish result window before opening the window.
         */
        publishReportManyDialog: function () {
            var report_ids = Reports.getReportsIds();

            gpAjax.ajaxGet('report', 'publish_report_many_dialog', {report_ids: report_ids}, true, function (data) {
                var wnd = GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_PUBLISH_REPORT),
                    title = report_ids.length === 1 ? _('Publish report') : _('Publish multiple reports');

                if (!wnd) {
                    wnd = GPWindowMgr.Create(GPWindowMgr.TYPE_PUBLISH_REPORT, title, {}, data.html);
				}
				else {
                    Reports.showPublishReportDialog(data.html, wnd);
				}

				wnd.getHandler().bindCheckboxes();
			});
        },

		/**
		 * Creates and show the
		 *
		 * @param string html html content for dialog
		 */
		showPublishReportDialog: function (html, wndhandle) {
			wndhandle.setContent2(html);
		},

		/**
		 * Published a report with given options via ajax
		 *
		 */
		publishReport: function () {
			// collect params from form
			var params = {};

			//inverse logic here because the question is 'show' while the elm.name says hide
			$('#publish_report_dialog_form input[type="checkbox"]').each(function (idx, elm) {
				params[elm.name] = $(elm).prop('checked') ? false : true;
			});
			$('#publish_report_dialog_form input[type="hidden"]').each(function (idx, elm) {
				params[elm.name] = $(elm).val();
			});

			// send ajax request
			gpAjax.ajaxPost('report', 'publish_report', params, false, function (data) {
				var wnd = GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_PUBLISH_REPORT);
				if (wnd) {
					Reports.showPublishReportDialog(data.html, wnd);
					wnd.getHandler().bindCheckboxes();
				}
			});

			return false;
		},

        publishReportMany: function () {
			var report_ids = Reports.getReportsIds();

            gpAjax.ajaxPost('report', 'publish_report_many', {report_ids: report_ids}, true, function (data) {
                var wnd = GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_PUBLISH_REPORT);
                if (wnd) {
                    Reports.showPublishReportDialog(data.html, wnd);
                }
            });

            return false;
		},

		unpublishReportMany: function () {
            var report_ids = Reports.getReportsIds();

            gpAjax.ajaxPost('report', 'unpublish_report_many', {report_ids: report_ids}, false);
            var wnd = GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_PUBLISH_REPORT);
            wnd.close();

            return false;
		},

		/**
		 * Deletes all reports
		 */
		deleteAllReports : function () {
			Layout.showConfirmDialog(_('Delete all reports'), _('Do you want to delete all reports in this folder?'), function () {
				GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_REPORT).sendMessage('reportDeleteAllOfFolder', 'report_form');
			});
		},

		/**
		 * Returns selected reports on the list
		 */
		getSelectedReports : function () {
			var counter = 0, parent = $('<div></div>');
			//@todo scope it!
			$("#report_list .reports_date input:checked").each(function () {
				parent.append($(this).parent().parent().clone());
				counter++;
			});

			return [counter, parent];
		},

		/**
		 * Removes selected reports from the list
		 */
		removeSelectedReports : function () {
			//@todo scope it!
			$("#report_list .reports_date input:checked").each(function () {
				$(this).parent().parent().remove();
			});
		},

		/**
		 * Returns a list of ids of the selected reports
		 */
		getReportsIds : function () {
			var values = [];

			//@todo scope it!
			$("#report_list .reports_date input:checked").each(function () {
				values[values.length] = $(this).val();
			});

			return values;
		}
	};

	window.Reports = Reports;
}());
