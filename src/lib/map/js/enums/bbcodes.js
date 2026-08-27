/* global Game, GameEvents, gpAjax, DM, CM */

/**
 *
 * @param $el jQuery DOM node
 * @param wrapper element that contains all bbcode buttons
 * @param target String id of the texfield in which we want to insert the BBCodes
 * @param context Window context
 *
 */
(function() {
	'use strict';

	var HelperDefaultColors = require('helpers/default_colors');

	function BBCode($el, wrapper, target, context) {
		this.cursorPosition = 0;
		this.currentPopup = null;
		this.$el = $el;
		var CONTEXT_MENU_BORDER_WIDTH_MIN = 7,
			CONTEXT_MENU_BORDER_WIDTH_MAX = 18;

		var that = this;

		//PRIVATE METHODS

		/**
		 * Just close opened popup when exists
		 */
		function closeOpenedPopup() {
			// ensure that only one popup are opened at the same time
			if (that.currentPopup) {
				that.currentPopup.off().remove();
			}
		}

		/**
		 **  Returns the caret (cursor) position of the specified text field.
		 **  Return value range is 0-oField.length.
		 */
		function getCursorPosition(el) {
			//Works with FF and IE9
			if (el.selectionStart) {
				return el.selectionStart;
			} else if (document.selection) {
				el.trigger("focus");

				var r = document.selection.createRange();

				if (r === null) {
					return 0;
				}

				var re = el.createTextRange(),
					rc = re.duplicate();

				re.moveToBookmark(r.getBookmark());
				rc.setEndPoint('EndToStart', re);

				return rc.text.length;
			}

			return 0;
		}

		/**
		 * Creates table which allows users to specify the content for the table
		 */
		function generateTablePreview(popup) {
			var parent = popup.find('.bb_table_preview'),
				rows = parseInt(popup.find('input.bb_table_rows').val(), 10) || 1,
				cols = parseInt(popup.find('input.bb_table_columns').val(), 10) || 1,
				header = popup.find('input.bb_table_header').is(':checked'),
				ex_rows = parent.find('tr'),
				ex_cells,
				i,
				j,
				row,
				cell,
				maxRows = 5,
				maxCols = 5;

			parent.empty();
			parent = $('<table />').appendTo(parent);

			for (i = 0; i < rows; i++) {
				row = $(ex_rows[i] ? ex_rows[i] : '<tr />').appendTo(parent);

				if (i === 0) {
					row[header ? 'addClass' : 'removeClass']('bb_table_withheader');
				}

				ex_cells = row.find('td');
				row.empty();

				for (j = 0; j < cols; j++) {
					cell = '<td><span class="grepo_input"><span class="left"><span class="right"><input class="bbinput_' + i + 'x' + j + '" /></span></span></span></td>';

					if (j === maxCols && i === maxRows) {
						cell = '<td></td>';
					} else if (j === maxCols || i === maxRows) {
						cell = '<td class="' + (i === maxRows ? 'last-row-cell' : '') + '">...</td>';
					}

					$(ex_cells[j] ? ex_cells[j] : $(cell)).appendTo(row);

					if (j === maxCols) {
						break;
					}
				}

				if (i === maxRows) {
					break;
				}
			}
		}

		function positionPopup(button, popup) {
			// get position of button:
			var pos = button.position(),
				parent = button.parent(),
				width, pwidth;

			pos.top = (pos.top * Game.ui_scale.normalize.factor) + button.height() + CONTEXT_MENU_BORDER_WIDTH_MIN;
			// border width = 18px
			width = popup.width() + CONTEXT_MENU_BORDER_WIDTH_MAX;
			pwidth = parent.outerWidth();

			pos.left *= Game.ui_scale.normalize.factor;
			pos.left += pwidth < pos.left + width ? pwidth - (pos.left + width) : 0;

			if (popup.parent()[0] !== parent[0]) {
				pos.left += parent.position().left * Game.ui_scale.normalize.factor;
			}

			popup.css(pos);
		}

		function openPopup(type, classname, callback) {
			//create and detach from DOM
			// .show() doesn't work in chrome 10
			var p = $('#bbcode_popups div.' + classname).clone().css('display', 'block').appendTo(wrapper);
			that.cursorPosition = getCursorPosition(that.$el.find(target)[0]);

			// ensure that only one popup are opened at the same time
			closeOpenedPopup();

			that.currentPopup = p;

			// add to names list
			Popups.names[type] = classname;

			//bind esc, enter ...
			p.on({
				change: function (e) {
					if (type === 'table') {
						var target = e.target, className = target.className || '', targetType = className.split('_');

						if (targetType[0] === 'bbinput' && target.tagName === 'INPUT') {
							Popups.tableValues[targetType[1]] = target.value;
						}
						generateTablePreview(p);
						positionPopup(wrapper.find('a.bbcode_option[name="table"]'), p);
					}
				},
				keydown: function (ev) {
					var kc = ev.keyCode;
					if (kc === 27) {
						p.off().remove();
						if (ev.preventBubble) {
							ev.preventBubble();
						}
					} else if (kc === 13) {
						if (typeof callback === 'function') {
							callback(ev);
						}
						p.off().remove();
					}
				},
				keyup: function (ev) {
					var target = ev.target;
					if (type === 'table' && target.className.match(/rows|columns/)) {
						generateTablePreview(p);
						positionPopup(wrapper.find('a.bbcode_option[name="table"]'), p);
					}
				},
				click: function (ev) {
					var target = ev.target,
						tag = target.tagName,
						classname;
					// don't call the callback function if click was triggered by an input element
					if (tag === 'INPUT' || !callback) {
						return;
					} else if (tag === 'A' && (classname = target.className) && classname.match('cancel')) {
						return p.off().remove();
					}

					callback(ev);
					p.off().remove();
				}
			});
			return p;
		}

		/**
		 * bind handler to bbcode-wrapper, check which link has been clicked, do magic
		 */
		function bindLinks() {
			wrapper.on("click", function (ev) {
				var name, start, end,
					ev_target = ev.target;

				if (ev_target.tagName !== 'A') {
					return;
				}

				closeOpenedPopup();

				name = ev_target.name;

				// ignore confirm or cancel buttons
				if (name === 'confirm' || name === 'cancel') {
					return false;
				} else if (['b', 'i', 's', 'u', 'url', 'img', 'island', 'center', 'christmas'].indexOf(name) !== -1) {
					start = end = name;
				} else if (name === 'quote') {
					start = name + '=Author';
					end = name;
				} else if (name === 'spoiler') {
					start = name + '=Spoiler';
					end = name;
				}

				if (start && end) {
					that.cursorPosition = getCursorPosition(that.$el.find(target)[0]);
					return that.insert('[' + start + ']', '[/' + end + ']');
				}

				if (name === 'score') {
					that.cursorPosition = getCursorPosition(that.$el.find(target)[0]);
					return that.insert('[score]' + Game.player_name, '[/score]', true);
				}

				if (typeof Popups[name] !== 'function') {
					return false;
				}

				var popup,
					classname = Popups.names[name];
				if (classname && (popup = wrapper.find('div.' + classname)).length) {
					popup.off().remove();
				} else {
					popup = Popups[name]();

					positionPopup($(ev_target), popup);

					if (name === 'table') {
						generateTablePreview(popup);
						positionPopup($(ev_target), popup);
					}
				}
			});
		}

		// closure for bbcode-popup functions, otherwise they would have been
		// public memebers of BBCode (which is not necessary)
		var Popups = function () {
			var self = this;
			this.names = {}; //type : classname, maintained by openPopup
			this.tableValues = {}; //data specified by user in bb_table_popup

			/**
			 * Opens/closes a dialog to choose the size of the text
			 */
			this.size = function () {
				var callback = function (ev) {
					that.insert('[size=' + ev.target.id.substr(1) + ']', '[/size]');
				};
				return openPopup('size', 'bb_sizes', callback);
			};

			this.table = function () {
				function callback() {
					var rows = parseInt(wrapper.find('input.bb_table_rows').val(), 10),
						cols = parseInt(wrapper.find('input.bb_table_columns').val(), 10),
						header = wrapper.find('input.bb_table_header').is(':checked'),
						str = '',
						c = cols,
						i,
						j,
						data = self.tableValues;

					for (i = 0; i < rows; i++) {
						str += header ? '[**]' : '[*]';

						for (j = 0; j < cols; j++) {
							str += (data[i + 'x' + j] || '') + (j === cols - 1 ? '' : (header ? '[||]' : '[|]'));
						}

						str += (header ? '[/**]' : '[/*]') + '\n';
						cols = c;
						header = false;
					}

					self.tableValues = {};
					that.insert('\n[table]\n' + str, '[/table]');
				}

				return openPopup('table', 'bb_table_popup', callback);
			};

			/**
			 * Opens/closes a dialog to choose a font type from the dropdown list.
			 */
			this.font = function (el) {
				return openPopup('font', 'bb_font_chooser', function (e) {
					var href = e.target.href,
						className;
					if (!href) {
						return;
					}
					className = href.split('#').reverse()[0];
					that.insert('[font=' + className + ']', '[/font]');
				});
			};

			/**
			 * Opens/closes a dialog to choose a town by autocompletion.
			 */
			this.town = function () {
				var p = openPopup('town', 'bb_town_chooser');

				// init autocomplete for town chooser
				p.find('input.bb_town_chooser_town_input').trigger("focus").oldautocomplete('/autocomplete', {
					'minChars' : 3,
					'max' : 500, // default is 10.. has to be big because limit is handled by server
					'extraParams' : {'what' : 'game_town'},
					'formatItem': function (row) {
						// formats the results in the autocomplete list
						return row[1] + ' (' + row[2] + ')';
					},
					'scaleFactor' : Game.ui_scale.normalize.factor
				}).result(function (result, row) {
					// callback when a town has been picked
					self.townChosen(row);
					p.off().remove();
				});
				return p;
			};

			/**
			 * Opens/closes a dialog to choose a temple by autocompletion.
			 */
			this.temple = function () {
				var p = openPopup('temple', 'bb_temple_chooser');

				// init autocomplete for temple chooser
				p.find('input.bb_temple_chooser_temple_input').trigger("focus").oldautocomplete('/autocomplete', {
					'minChars' : 3,
					'max' : 500, // default is 10.. has to be big because limit is handled by server
					'extraParams' : {'what' : 'game_temple'},
					'formatItem': function (row) {
						// formats the results in the autocomplete list
						return row[1] + ' (' + row[2] + ')';
					},
					'scaleFactor' : Game.ui_scale.normalize.factor
				}).result(function (result, row) {
					// callback when a temple has been picked
					self.templeChosen(row);
					p.off().remove();
				});
				return p;
			};

			this.player = function() {
				var p = openPopup('player', 'bb_player_chooser');

				// init autocomplete for town chooser
				p.find('input.bb_player_chooser_player_input').trigger("focus").oldautocomplete('/autocomplete', {
					'minChars' : 3,
					'max' : 500, // default is 10.. has to be big because limit is handled by server
					'extraParams' : {what : 'game_player'},
					'formatItem': function (row) {
						// formats the results in the autocomplete list
						return row[0];
					},
					'scaleFactor' : Game.ui_scale.normalize.factor
				}).result(function (result, row) {
					// callback when a town has been picked
					self.playerChosen(row);
					p.off().remove();
				});
				return p;
			};

			this.ally = function() {
				var p = openPopup('ally', 'bb_ally_chooser');

				// init autocomplete for town chooser
				p.find('input.bb_ally_chooser_ally_input').trigger("focus").oldautocomplete('/autocomplete', {
					'minChars' : 3,
					'max' : 500, // default is 10.. has to be big because limit is handled by server
					'extraParams' : {'what' : 'game_alliance'},
					'formatItem': function (row) {
						// formats the results in the autocomplete list
						return row[0];
					},
					'scaleFactor' : Game.ui_scale.normalize.factor
				}).result(function (result, row) {
					// callback when a town has been picked
					self.allyChosen(row);
					p.off().remove();
				});
				return p;
			};

			this.reservation = function() {
				var p = openPopup('reservation', 'bb_town_chooser');

				// init autocomplete for town chooser
				p.find('input.bb_town_chooser_town_input').trigger("focus").oldautocomplete('/autocomplete', {
					'minChars' : 3,
					'max' : 500, // default is 10.. has to be big because limit is handled by server
					'extraParams' : {'what' : 'game_town'},
					'formatItem': function (row) {
						// formats the results in the autocomplete list
						return row[1] + ' (' + row[2] + ')';
					},
					'scaleFactor' : Game.ui_scale.normalize.factor
				}).result(function (result, row) {
					// callback when a town has been picked
					self.reservationChosen(row);
					p.off().remove();
				});
				return p;
			};

			/**
			 * Callback function called when user has picked a town
			 */
			this.townChosen = function (row) {
				that.insert('[town]' + row[0], '[/town]', true);
			};

			/**
			 * Callback function called when user has picked a temple
			 */
			this.templeChosen = function (row) {
				that.insert('[temple]' + row[0], '[/temple]', true);
			};

			/**
			 * Callback function called when user has picked a town
			 */
			this.playerChosen = function (row) {
				that.insert('[player]' + row[0], '[/player]', true);
			};

			/**
			 * Callback function called when user has picked a town
			 */
			this.allyChosen = function (row) {
				that.insert('[ally]' + row[0], '[/ally]', true);
			};

			/**
			 * Callback function called when user has picked a town
			 */
			this.reservationChosen = function (row) {
				that.insert('[reservation]' + row[0], '[/reservation]', true);
			};

			/**
			 * Opens/closes a dialog to choose a report by autocompletion.
			 */
			this.report = function () {
				var p = openPopup('report', 'bb_report_chooser');

				// init autocomplete for report chooser
				p.find('input.bb_report_chooser_report_input').oldautocomplete('/autocomplete', {
					'minChars' : 3,
					'max' : 500, // default is 10.. has to be big because limit is handled by server
					'extraParams' : {'what' : 'game_report'},
					'formatItem': function (row) {
						// formats the results in the autocomplete list
						return row[1] + ' (' + row[2] + ')';
					},
					'scaleFactor' : Game.ui_scale.normalize.factor
				}).result(function (result, row) {
					// callback when a town has been picked
					self.reportChosen(row);
					p.off().remove();
				});
				return p;
			};

			/**
			 * Callback function called when user has picked a report
			 */
			this.reportChosen = function (row) {
				that.insert('[report]' + row[0], '[/report]', true);
			};

			function awardChanged(select_list, p) {
				var type = select_list[0].value,
					world_id = select_list[1].value,
					award_id = select_list[2].value;

				if (type === '') {
					return select_list.filter('select.bb_award_chooser_award_world').hide();
				}

				if (this.name === 'world' && world_id === '') { // jshint ignore:line
					return select_list.filter('select.bb_award_chooser_award_award').hide();
				}

				if (this.name  === 'award' && award_id === '') { // jshint ignore:line
					return false;
				}

				var params = {type: type};

				if (this.name === 'world') { // jshint ignore:line
					params.world_id = world_id;
				} else if (this.name  === 'award') { // jshint ignore:line
					params.world_id = world_id;
					params.award_id = award_id;
				}

				gpAjax.ajaxGet('player_award', 'get_awards', params, true, function (data) {
					var worlds, awards;
					if (data.code) {
						that.insert('[award]' + data.code, '[/award]', true);

						select_list.filter('option[value=""]').attr('selected', 'selected').end()
							.filter('select.bb_award_chooser_award_world, select.bb_award_chooser_award_award').hide();

						p.off().remove();
					} else if (data.world_ids) {
						worlds = select_list.filter('select.bb_award_chooser_award_world').empty().append($('<option></option>').val('').html(_('- please select -')));
						$.each(data.world_ids, function (world_id, world_name) {
							worlds.append($('<option></option>').val(world_id).html(world_name));
						});
						worlds.show();
					} else if (data.award_ids) {
						awards = select_list.filter('select.bb_award_chooser_award_award').empty().append($('<option></option>').val('').html(_('- please select -')));
						$.each(data.award_ids, function (award_id, award_name) {
							awards.append($('<option></option>').val(award_id).html(award_name));
						});
						awards.show();
					}
				});
			}

			/**
			 * Opens/closes a dialog to choose the award.
			 */
			this.award = function () {
				var p = openPopup('award', 'bb_award_chooser'),
					select = p.find('select');

				p.on('change', function (ev) {
					awardChanged.call(ev.target, select, p);
				});

				return p;
			};

			this.color = function () {
				var $popup = openPopup('color', 'bb_color_picker_popup'),
					l10n = DM.getl10n('color_picker'),
					default_color = HelperDefaultColors.getDefaultColor('text');

				CM.unregister(context, 'bb_color_picker');
				CM.register(context, 'bb_color_picker', $popup.find('.content').colorpicker({
					l10n: {
						default_btn: l10n.default_btn,
						save_color: l10n.save_color,
						default_color_text: l10n.default_color_text,
						preview_text: l10n.preview_text
					},
					type: 'text',
					default_color: default_color,
					changeColor: function(new_color) {
						that.insert('[color=#' + new_color + ']', '[/color]');
						$.Observer(GameEvents.color_picker.change_color).publish({
							color: new_color,
							type: 'text',
							id: 0
						});

						closeOpenedPopup();
					}
				}));

				return $popup;
			};

			return this;
		}.call({});

		/**
		 * Inserts a start and end tag in the target and positions the cursor in between.
		 *
		 * @param start_tag String
		 * @param end_tag String
		 * @param force_place_outside Boolean if true cursor will be position behind end_tag
		 */
		this.insert = function (start_tag, end_tag, force_place_outside) {
			var jq_input = that.$el.find(target);
			var scroll_pos = jq_input.scrollTop();
			var ins_text, input;

			input = jq_input[0];

			if (typeof input.selectionStart !== 'undefined') {
				// for newer Gecko based browsers
				jq_input.trigger("focus");
				// insert
				var start = input.selectionStart;
				var end = input.selectionEnd;
				ins_text = input.value.substring(start, end);
				input.value = input.value.substr(0, start) + start_tag + ins_text + end_tag + input.value.substr(end);

				// adjust cursor position
				var pos;
				if (ins_text.length > 0 || force_place_outside) {
					pos = start + start_tag.length + ins_text.length + end_tag.length;
				} else {
					pos = start + start_tag.length;
				}
				input.selectionStart = pos;
				input.selectionEnd = pos;
			} else if (typeof document.selection !== 'undefined') { // for IE
				//focussing in ie works different then anywhere else
				var text_range = input.createTextRange();
				if (that.cursorPosition && that.cursorPosition !== 0) {
					text_range.collapse(true);
					text_range.moveEnd('character', that.cursorPosition);
					text_range.moveStart('character', that.cursorPosition);
					text_range.text = start_tag + end_tag;
					text_range.select();
				} else {
					text_range.collapse(false);
					text_range.select();

					// insert
					var range = document.selection.createRange();
					ins_text = range.text;
					range.text = start_tag + ins_text + end_tag;

					// adjust cursor position
					range = document.selection.createRange();
					if (ins_text.length > 0 || force_place_outside) {
						range.moveStart('character', start_tag.length + ins_text.length + end_tag.length);
					} else {
						text_range.move('character', -end_tag.length);
					}
					range.select();
				}
			}

			input.scrollTop = scroll_pos;

			// make sure that our textbox fires a proper event for listeners to react upon
			// textare component otherwise doesn't update its state
			jq_input.keyup();

			return false;
		};

		bindLinks();
	}

	window.BBCode = BBCode;
}());
