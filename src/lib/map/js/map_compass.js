/* globals Game, isNumber */

(function() {
	'use strict';

	var LayoutModes = require('enums/layout_modes');

	window.Compass = function Compass(unit_time_to_arrival, coord_elem_id, town_dir_elem_id) {
		var lookup_sin = [],
			lookup_cos = [],
			cutoff,
			$townDirElem = $('#' + town_dir_elem_id),
			$coordElem = $('#' + coord_elem_id),
			that = this,
			is_calculate_arrival_time = false,
			distance,
			last_pointer_position = {x: 0, y: 0};

		function displayCompass() {
			var is_on_island_view = Game.layout_mode === LayoutModes.ISLAND_VIEW,
				is_on_strategic_map = Game.layout_mode === LayoutModes.STRATEGIC_MAP,
				is_browser_support_good = (jQuery.support.opacity && jQuery.support.leadingWhitespace);

			return (is_on_island_view || is_on_strategic_map) &&
				(Game.map_arrow_show_always || is_browser_support_good);
		}

		function getDistance(a, b) {
			return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
		}

		/**
		 * @return {Number} angle in grad
		 */
		function getAngleBetween(pos1, pos2) {
			// Arrow to current_town
			var rad = -Math.atan2(pos1.x - pos2.x, pos1.y - pos2.y) + Math.PI;

			return (isNumber(rad)) ? Math.round((rad * 180 / Math.PI)) : NaN;
		}

		/**
		 * Sets the transformations for modern browsers
		 *
		 * @param grad Number
		 * @param pos Object {x: Number, y: Number}
		 */
		function setTransform(grad, pos) {
			var style = cutoff ? 'display: none' : 'transform:translate(34px,38px) rotate(' + (grad + 90).toString() + 'deg)translate(60px,0);',
				scale = 'scale(1,0.5);';

			$townDirElem.attr('style', style);
			$coordElem.attr(
				'style',
				['transform:translate(',
					Math.round(pos.x * Game.ui_scale.normalize.factor - 50), 'px, ',
					Math.round(pos.y * Game.ui_scale.normalize.factor - 50), 'px) ',
					scale
				].join('')
			);
		}

		/**
		 * Initializes this thing.
		 */
		function init() {
			// Compute lookup tables:
			var i = 360,
				pi = 2 * Math.PI / 360,
				half_pi = Math.PI / 2;

			is_calculate_arrival_time = false;
			unit_time_to_arrival.onChangeWatching(function(unit_time_to_arrival, watching) {
				is_calculate_arrival_time = watching;
				if (is_calculate_arrival_time) {
					unit_time_to_arrival.setDistance(distance);
				}
			}, that);

			// Fill lookup tables
			while (i--) {
				lookup_sin.push(Math.sin(half_pi + pi * -i));
				lookup_cos.push(Math.cos(half_pi + pi * -i));
			}
		}

		this.move = function (event, mapPosition, townPosition, scale) {

			if (Game.isMobileBrowser()) {
				return;
			}

			if (event) {
				last_pointer_position = {x: event.clientX, y: event.clientY};
			}

			scale = scale ? scale : 1;

			var pos, pos2;
			pos = {x: last_pointer_position.x - mapPosition.x, y: last_pointer_position.y - mapPosition.y};
			pos2 = townPosition;

			var grad = getAngleBetween(pos, pos2);

			distance = Math.round(getDistance(pos, pos2) * 10) / 10;
			distance /= scale;
			cutoff = distance < 45;

			// set duration
			if (is_calculate_arrival_time) {
				unit_time_to_arrival.setDistance(distance);
			}

			if (displayCompass()) {
				setTransform(grad, last_pointer_position);
			}
		};

		init();
	};
}());
