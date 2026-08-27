/* global GameData, debug, WMap, Timestamp */

/**
 * Handle Display of Progressbar on the Farmtowns
 */

(function() {
	'use strict';

	var MapHelpers = require('map/helpers');
	var features = require('data/features');

	window.FarmTownBars = (function() {
		/*
		 * Private members
		 */

		var farm_towns = [];
		var farm_towns_lock = false;
		var timer_interval = 2E5;
		var timer_handle = null;
		var time_base = {};
		var enabled = false;
		/*
		 * Public methods
		 */

		var FarmTownBars = {

			initialize : function() {
				if (!features.battlepointVillagesEnabled()) {
					enabled = true;
				}

				//Initialize Object
				timer_handle = window.setInterval(update,timer_interval);
			},

			isEnabled : function() {
				return enabled;
			},

			setVisibleTowns : function(towns) {
				if (!enabled) {
					return;
				}

				//I don't know who change that, but till 2.18 towns was an array
				if (towns.hasOwnProperty('towns')) {
					towns = towns.towns;
				}

				if (farm_towns_lock) {
					debug('FarmTownBars.farm_towns_lock = true');
					return;
				}

				farm_towns_lock = true;
				farm_towns = [];
				var xy_nr,
					town_type,
					town;

				for (xy_nr in towns) {
					if (towns.hasOwnProperty(xy_nr)) {
						town = towns[xy_nr];
						// determine the next timestamp that a load will be ready
						town_type = MapHelpers.getTownType(town);

						if (town_type === 'farm_town' && town.relation_status === 1) {
							farm_towns.push({
								'id' : town.id,
								'loot' : town.loot,
								'looted' : town.looted,
								'town_obj_ref' : town
							});
						}
					}
				}
				farm_towns_lock = false;

				update();
			}
		};

		/**
		 *
		 * @return Number between 0 and 1
		 */
		function f(x) {
			if (x < 0.6) {
				return 0.208333 * x;
			} else if (x < 0.9333) {
				return 0.375038 * x - 0.100023;
			} else if (x < 0.9833) {
				return 5 * x - 4.4165;
			} else {
				return 29.9401 * x - 28.9401;
			}
		}

		/*
		 * Private methods
		 * TODO: improve IE... width() & height() are expensive
		 */

		function update() {
			if (!enabled) {
				return;
			}

			if (farm_towns_lock) {
				debug('FarmTownBars.farm_towns_lock = true');
				return;
			}

			farm_towns_lock = true;

			//deep copy
			var copy_farm_towns = [],
				farm_town,
				xy_nr;

			for (xy_nr in farm_towns) {
				if (farm_towns.hasOwnProperty(xy_nr)) {
					farm_town = farm_towns[xy_nr];
					copy_farm_towns.push({
						'id' : farm_town.id,
						'loot' : farm_town.loot,
						'looted' : farm_town.looted,
						'town_obj_ref' : farm_town.town_obj_ref
					});
				}
			}

			farm_towns_lock = false;
			var town, id, town_data,
				interval, values;

			var i =  copy_farm_towns.length;

			while (i--) {
				town_data = copy_farm_towns[i];
				id = town_data.id;

				if (town_data.loot <= Timestamp.now()) {
					delete time_base[id];
					continue;
				}

				town = $('#farm_town_' + id);

				if (!town.hasClass('res_bar')) {
					town.append('<span class="res_bar"><span class="res_bar_inner"></span><span class="res_available not"></span></span>');
					town_data.town_obj_ref.popup = null;
				}

				if (!time_base[id]) {
					interval = town_data.loot - town_data.looted;
					values = GameData.farm_town_time_values;

					if (values.normal.indexOf(interval) >= 0) {
						time_base[id] = values.normal[values.normal.length - 1];
					} else if (values.booty.indexOf(interval) >= 0) {
						time_base[id] = values.booty[values.booty.length - 1];
					}
				}

				var x = (1 - (town_data.loot - Timestamp.now()) / time_base[id]);
				var rad = f(x) * Math.PI;

				var deg = (Math.round((rad * 180 / Math.PI)) % 360);

				town.find('span.res_bar_inner').css('transform', 'rotate(' + deg + 'deg)');
			}
		}

		return FarmTownBars;
	}());
}());
