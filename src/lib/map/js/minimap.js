/*global GameEvents, WMap, Game, MapTiles, us, MM, JSON, Backbone */

(function () {
	'use strict';

	var MapHelpers = require('map/helpers'),
		OlympusHelper = require('helpers/olympus'),
		TOWN_TYPES = require('enums/town_types'),
		ISLAND_VIEW = require('enums/layout_modes').ISLAND_VIEW,
		StrategicMapFilterFactory = require('features/strategic_map_filter/factories/strategic_map_filter'),
		DefaultColors = require('helpers/default_colors');

	window.GPMinimap = function GPMinimap(a_scale) {
		var scale = a_scale || 0.2;
		var type = 'mini';

		//cache elements
		var elm = {
				canvas: $('#ui_box .minimap_canvas, #minimap_canvas'),
				minimap: $('#minimap'),
				layer: $('#minimap_islands_layer')
			},
			doc = document,
			initialized = false;

		var max_island_width = 1152, // approximation ... if we more agressive clipping, we should probably improve this ...
			max_island_height = 640;

		// canvas width & height
		var c_w, c_h;

		let size = {'x': 0, 'y': 0},
			mapScroll = {'x': 0, 'y': 0},
			maxScroll = {
				minx: 200,
				miny: 50,
				// calculate width of map in pixel
				maxx: ((WMap.getMapSize() * WMap.getTileDimensions().x)) * scale,
				// calculate height of map in pixel
				maxy: ((WMap.getMapSize() * WMap.getTileDimensions().y)) * scale
			},
			lastMousePos = {},
			mapPos = {}, // upper left corner of map
			visibleChunks = {},
			dblclick = false; // doubleclick detection timer

		var _self = this; // self reference

		var threshold = 200,// (px)
			moveSinceLastLoad = {x: 0, y: 0}; // (px)

		var is_expanded = false;

		var alliance_pact_collection = MM.getOnlyCollectionByName('AlliancePact');

		const wonders_marker_offset = {x: 30, y: 30}; //based on asset dimensions

		alliance_pact_collection.onAlliancePactChange(_self, this.refresh_and_redraw_minimap);
		MM.getModels().Player[Game.player_id].onChangeAllianceMembership(_self, this.refresh_and_redraw_minimap);

		/**
		 * collapse canvas
		 */
		function collapse() {
			if (is_expanded) {
				maxScroll.maxx += c_w;
				maxScroll.maxy += c_h;
			}

			elm.canvas.removeClass('expanded').addClass('collapsed');
			elm.minimap.hide();
			elm.layer.empty();

			$(document).off('keydown.GPMinimap');

			$.Observer(GameEvents.map.jump).unsubscribe([type]);

			is_expanded = false;
		}

		/**
		 * expand  canvas
		 */
		function expand() {
			elm.canvas.removeClass('collapsed').addClass('expanded');
			elm.minimap.show();
			// cache canvas width & height
			c_h = elm.canvas.height();
			c_w = elm.canvas.width();

			//These values can not be subtracted every time when this function is called.
			if (!is_expanded) {
				maxScroll.maxx += c_w;
				maxScroll.maxy += c_h;
			}

			$.Observer(GameEvents.map.jump).unsubscribe([type]);
			$.Observer(GameEvents.map.jump).subscribe([type], function (event, data) {
				_self.refresh();
			});

			$.Observer(GameEvents.document.key.esc.up).unsubscribe([type]);
			$.Observer(GameEvents.document.key.esc.up).subscribe([type], function () {
				collapse();
				$.Observer(GameEvents.ui.layout_mode.island_view.activate).publish({});
			});

			is_expanded = true;
		}

		/**
		 * returns the rectangle which covers the viewport
		 *
		 * @return {Object} {x: x-coord, y: y-coord, w: width, h: height}
		 */
		function getRect() {
			// size of viewport in map-coordinatre-measurement
			size = MapHelpers.pixel2Map(c_w / scale, c_h / scale);

			return {
				x: mapPos.x,
				y: mapPos.y,
				w: size.x,
				h: size.y
			};
		}

		/**
		 * Sorts towns by island.
		 *
		 * @param chunk Map Chunk
		 * @return Object {i.x_i.y: [town_1,...town_n], ...}
		 */
		function sortTowns(chunk) {
			var i, t;
			var towns = {};

			for (i in chunk.towns) {
				if (!chunk.towns.hasOwnProperty(i)) {
					continue;
				}
				t = chunk.towns[i];
				if (t.type === 'inv_spo' || t.invitation_spot) {
					continue;
				}
				if (!towns[t.x + '_' + t.y]) {
					towns[t.x + '_' + t.y] = [];
				}
				towns[t.x + '_' + t.y].push(t);
			}

			return towns;
		}

		function getHashedTownData(town) {
			var town_type = 'town';
			if (town.type === TOWN_TYPES.DOMINATION_AREA_MARKER) {
				town_type = town.type;
			}
			return btoa(JSON.stringify({
				id: town.id,
				ix: town.x,
				iy: town.y,
				tp: town_type,
				number_on_island: town.nr
			}));
		}

		function renderTempleMarker(island, $island) {
			var id = 'temple_marker_' + island.id,
				temple_marker = document.getElementById(id),
				str_data = '{"tp":"temple","id":' + island.id + ',"ix":' + island.x + ',"iy":' + island.y + ',"res":"' + island.res + '"}',
				temple;

			if (temple_marker) {
				return;
			}

			temple = OlympusHelper.getTempleByIslandXAndIslandY(island.x, island.y);
			temple_marker = document.createElement('a');
			temple_marker.id = id;
			temple_marker.className = temple.getTempleSize() + '_temple_marker';
			temple_marker.href = '#' + btoa(str_data);
			$island.appendChild(temple_marker);
		}

		function renderWorldWonder(wonder_data) {
			var id = 'mini_w' + wonder_data.ix + '_' + wonder_data.iy,
				wonder = document.getElementById(id);

			if (wonder && wonder_data.wt) {
				return;
			}

			wonder = document.createElement('a');
			wonder.id = id;
			wonder.className = 'wonder_marker ' + wonder_data.wt;
			wonder.href = '#' + btoa('{"ix":' + wonder_data.ix + ',"iy":' + wonder_data.iy + ',"tp":"wonder"}');
			wonder.style.left = (wonder_data.ox - wonders_marker_offset.x) * scale + 'px';
			wonder.style.top = (wonder_data.oy - wonders_marker_offset.y) * scale + 'px';

			if (wonder_data.pop) {
				wonder.title = wonder_data.pop;
			}

			return wonder;
		}

		/**
		 * Renders the visible towns & islands of a map chunk.
		 *
		 * @param {MapChunk} chunk
		 */
		function renderChunk(chunk) {
			if (!chunk) {
				return false;
			}

			// sort towns by island, it is faster to append them this way.
			// cleanup and clipping are also simplified by this.
			var islands = chunk.islands,
				towns = sortTowns(chunk),
				wonders = chunk.wonders,
				visibleIslands = {},
				fragment,
				do_once = false;

			// fragment position
			var frag_x = 0,
				frag_y = 0,
				id, pos, x, y, island,
				// clipping conditions
				clip_left, clip_right, clip_top, clip_bottom,
				iId,
				i = islands.length;

			id = type + '_chunk_' + chunk.chunk.x + '_' + chunk.chunk.y;

			function renderDominationMarker(town, tId) {
				var domination_marker = doc.createElement('div');
				domination_marker.id = 'domination_area_marker_' + tId;
				/* jshint ignore:start */
				domination_marker.style.left = ~~(town.ox * scale) + 'px';
				domination_marker.style.top = ~~(town.oy * scale) + 'px';
				/* jshint ignore:end */
				domination_marker.className = 'domination_area_marker';
				domination_marker.innerHTML = '<a class="tile" href="#' + getHashedTownData(town) + '" title=""></a>';
				return domination_marker;
			}

			// create town div
			//Important !!! - DON'T MOVE THIS FUNCTION BECAUSE IT'S AN INNER FUNCTION!!!
			function renderTown(t, tId) {
				var town = doc.createElement('a');
				town.id = tId;
				/* jshint ignore:start */
				town.style.left = ~~(t.ox * scale) + 'px';
				town.style.top = ~~(t.oy * scale) + 'px';
				/* jshint ignore:end */

				const fc = MapHelpers.isGhostTown(t) ? DefaultColors.getGhostTownColor() : t.fc;
				town.style.color = "#" + (fc || 'f00');
				if (t.type) {
					town.style['font-size'] = '50%';
				}
				town.innerHTML = ((t.type && t.type === 'inv_spo') || t.invitation_spot) ? '\u25c9' : '\u25cf';
				town.className = 'm_town';
				town.href = '#' + getHashedTownData(t);
				if (t.alliance_id) {
					town.className += ' alliance_' + t.alliance_id;
				}
				if (t.player_id) {
					town.className += ' player_' + t.player_id;
				}

				return town;
			}

			//clipping function
			//Important !!! - DON'T MOVE THIS FUNCTION BECAUSE IT'S AN INNER FUNCTION!!!
			function clip() {
				// clipping conditions
				clip_left = mapScroll.x + ~~(x + max_island_width * scale) < 0; // jshint ignore:line
				clip_right = mapScroll.x + x > c_w;
				clip_top = mapScroll.y + ~~(y + max_island_height * scale) < 0; // jshint ignore:line
				clip_bottom = mapScroll.y + y > c_h;

				return (clip_left || clip_right || clip_top || clip_bottom);
			}

			// checking if chunk root element already exists:
			if ((fragment = doc.getElementById(id))) {
				frag_x = parseInt(fragment.style.left, 10);
				frag_y = parseInt(fragment.style.top, 10);
			} else {
				fragment = doc.createElement('div');
				fragment.className = 'm_chunk';
				fragment.id = id;
				do_once = true;
			}

			// iterate over all islands:
			while (i--) {
				pos = MapHelpers.map2Pixel(islands[i].x, islands[i].y);

				x = Math.floor(pos.x * scale);
				y = Math.floor(pos.y * scale);

				//do only if chunk has been created
				if (do_once) {
					// set position of chunk root element (first island is used)
					fragment.style.left = (frag_x = x) + 'px';
					fragment.style.top = (frag_y = y) + 'px';
					do_once = false;
				}

				// island div id
				iId = type + '_i' + islands[i].x + '_' + islands[i].y;

				if (clip()) {
					if ((island = doc.getElementById(iId))) {
						island.parentNode.removeChild(island);
					}
				} else {
					if (!(island = doc.getElementById(iId))) {
						island = doc.createElement('div');
						island.style.left = x - frag_x + 'px';
						island.style.top = y - frag_y + 'px';
						island.className = 'm_island';
						island.id = iId;

						if (MapHelpers.isTempleTile(islands[i].type)) {
							renderTempleMarker(islands[i], island);
						} else {
							island.style.backgroundImage = 'url(' + Game.img() + '/game/map/' + Math.round(1 / scale) + '/' + MapTiles.islands[islands[i].type].img + ')';
						}

						fragment.appendChild(island);

						var key = islands[i].x + '_' + islands[i].y;
						var t_arr;

						if ((t_arr = towns[key])) {
							var a = t_arr.length,
								tId;
							while (a--) {
								tId = (type + '_t' + towns[key][a].id).replace('=', '');
								if (towns[key][a].type === TOWN_TYPES.DOMINATION_AREA_MARKER) {
									island.prepend(renderDominationMarker(towns[key][a], tId));
									continue;
								}
								// towns nr >= 20 are island quests
								if (towns[key][a].fc && !doc.getElementById(tId) && towns[key][a].nr < 20) {
									// Do not display towns which do not have any flag color
									island.appendChild(renderTown(towns[key][a], tId));
								}
							}
						}

						if (wonders[key]) {
							island.appendChild(renderWorldWonder(wonders[key]));
						}
					}

					visibleIslands[islands[i].x + '_' + islands[i].y] = true;
				}
			}

			visibleChunks[chunk.chunk.x + '_' + chunk.chunk.y] = {
				fragment: fragment
			};

			if (!doc.getElementById(fragment.id)) {
				elm.layer[0].appendChild(fragment);
			}
		}

		/**
		 * Loads and renders Map Chunks.
		 *
		 * @param {Object} rect {x: x-coord, y: y-coord, w: rectangle width, h: rectangle height}
		 * @return {Array} with all chunk-coords
		 */
		function loadChunks(rect, reload_required) {
			var chunks = WMap.mapData.getCoveredChunks(rect.x, rect.y, rect.w, rect.h);

			WMap.mapData.checkReload(rect.x, rect.y, rect.w, rect.h, function () {
				// call for each chunk:
				var i = chunks.length;

				while (i--) {
					renderChunk(WMap.mapData.getChunk(chunks[i].x, chunks[i].y));
				}

				$.Observer(GameEvents.minimap.load_chunks).publish();
			}, reload_required);

			return chunks;
		}

		/**
		 * Translates mouse-event coordinates to WMap-pixel-coordinates.
		 *
		 * @param e Event
		 */
		function convertMousePositionToWMapPosition(e) {
			var off = $('#main_area').offset(),
				m_x,
				m_y;

			if ((e.originalEvent && e.originalEvent.touches) || e.touches) {
				e.preventDefault();
				m_x = -mapScroll.x + (lastMousePos.x - off.left) * Game.ui_scale.normalize.factor;
				m_y = -mapScroll.y + (lastMousePos.y - off.top) * Game.ui_scale.normalize.factor;
			} else {
				m_x = -mapScroll.x + (e.pageX - off.left) * Game.ui_scale.normalize.factor;
				m_y = -mapScroll.y + (e.pageY - off.top) * Game.ui_scale.normalize.factor;
			}

			return {
				x: m_x / scale + (max_island_width >> 1) - (WMap.size.x >> 1), // jshint ignore:line
				y: m_y / scale + (max_island_height >> 1) - (WMap.size.y >> 1) // jshint ignore:line
			};
		}

		function zoomIn(e) {
			e = jQuery.event.fix(e);

			var pos = convertMousePositionToWMapPosition(e),
				id = 'minimap_viewport',
				box = doc.getElementById(id) || doc.createElement('div'),
				w = c_w * scale,
				h = c_h * scale,
				y_off = $('#main_area').offset().top,
				box_pos = {x: 0, y: 0};

			if (e.originalEvent.touches) {
				box_pos = lastMousePos;
			} else {
				box_pos = {
					x: e.pageX,
					y: e.pageY
				};
			}

			box.id = id;
			box.style.left = box_pos.x - (w >> 1) + 'px'; // jshint ignore:line
			box.style.top = box_pos.y - y_off - (h >> 1) + 'px'; // jshint ignore:line
			box.style.width = w + 'px';
			box.style.height = h + 'px';

			elm.canvas.append(box);

			$(box).animate({
				width: c_w,
				height: c_h,
				left: 0,
				top: 0
			}, 400, 'swing', function () {
				WMap.centerMapOnPos(pos.x, pos.y);
				collapse();
				box.parentNode.removeChild(box);
			});
		}

		function handleDblClick(e) {
			dblclick = false;
			zoomIn(e);
			window.layout_main_controller.setLayoutMode(ISLAND_VIEW);
			$.Observer(GameEvents.map.zoom_in).publish();
			StrategicMapFilterFactory.closeWindow();
		}

		/**
		 * Cleans the layer.
		 */
		function cleanUp(chunks) {
			var chunk,
				i = chunks.length,
				vChunk;

			while (i--) {
				if ((chunk = visibleChunks[chunks[i].x + '_' + chunks[i].y])) {
					chunk.keep = true;
				}
			}

			// iterate over all visible chunks and remove the ones we don't need anymore.
			for (i in visibleChunks) {
				if ((vChunk = visibleChunks[i]).keep) {
					// remove flag for next iteration
					vChunk.keep = false;
				} else {
					try {
						elm.layer[0].removeChild(vChunk.fragment);
					} catch (e) {
						// do nothing for now ...
					} finally {
						delete vChunk.fragment;
						vChunk = 0;
						delete visibleChunks[i];
					}
				}
			}

			// remove borders:
			elm.layer.find('div.m_border').remove();
		}

		function refetchDataAndRefreshMap(reload_required) {
			cleanUp(loadChunks(getRect(), reload_required));
			_self.drawBorders();
			moveSinceLastLoad.x = 0;
			moveSinceLastLoad.y = 0;
		}

		/**
		 * Scrolls map to position within maxScroll-boundaries.
		 *
		 * @param {Object} pos {x: px-value, y: px-value}
		 */
		function scrollMapTo(pos) {
			//Position of the upper left map corner from the center of the screen
			// restricts the positions into maxScroll boundaries to allow slight overscroll
			var map_pos_from_center = {
				x: us.clamp(pos.x, -maxScroll.maxx, maxScroll.minx),
				y: us.clamp(pos.y, -maxScroll.maxy, maxScroll.miny)
			};

			//scroll of the map from the upper left corner of the screen
			mapScroll.x = Math.floor(map_pos_from_center.x + (c_w / 2));
			mapScroll.y = Math.floor(map_pos_from_center.y + (c_h / 2));

			elm.minimap.css({translate: [mapScroll.x, mapScroll.y]});

			// update map position
			const pos2 = MapHelpers.pixel2Map(-mapScroll.x / scale, -mapScroll.y / scale);
			mapPos.x = pos2.x;
			mapPos.y = pos2.y;

			const map_coords = MapHelpers.pixel2Map(-map_pos_from_center.x / scale, -map_pos_from_center.y / scale);
			WMap.updateMapCoordInfo(map_coords.x, map_coords.y);
		}

		/**
		 * @param {Object} pos
		 */
		function refreshAndScrollMapTo(pos) {
			moveSinceLastLoad.x += pos.x - mapScroll.x;
			moveSinceLastLoad.y += pos.y - mapScroll.y;

			if (Math.abs(moveSinceLastLoad.x) > threshold ||
				Math.abs(moveSinceLastLoad.y) > threshold) {
				refetchDataAndRefreshMap();
			}

			scrollMapTo({
				x: pos.x,
				y: pos.y
			});
		}

		/**
		 * Returns information whether the minimap is initialized or not
		 *
		 * @return {Boolean}
		 */
		this.isInitialized = function () {
			return initialized;
		};

		this.refresh_and_redraw_minimap = function () {
			if (_self.isMiniMapActive()) {
				refetchDataAndRefreshMap(true);
				_self.refresh({center_on_current_town: false});
			}
		};

		this.fillCanvas = function (center_town) {
			var ts = MapTiles.tileSize;

			expand();
			if (center_town) {
				// scroll map to active town, center on screen:
				mapPos.x = WMap.mapX;
				mapPos.y = WMap.mapY;

				// TODO: remove this hack when we've found out _why_
				// WMap.scroll is {x:0,y:0} in some cases, when in fact it
				// should contain a real value.
				//var p1 = MapHelpers.map2Pixel(mapPos.x, mapPos.y);
				var p2 = {
					x: -(WMap.scroll.x + (WMap.size.x >> 1) + ts.x) * scale, // jshint ignore:line
					y: -(WMap.scroll.y + (WMap.size.y >> 1) + ts.y) * scale  // jshint ignore:line
				};

				refreshAndScrollMapTo({
					x: p2.x,
					y: p2.y
				});
			}

			loadChunks(getRect());

			this.drawBorders();

			initialized = true;
		};

		/**
		 * Draws sea borders on map.
		 */
		this.drawBorders = function () {
			if (Game.isiOs()) {
				return false;
			}

			var fragment = doc.createDocumentFragment(),
				map_size = MapTiles.mapSize,
				coords, pixels, sea_id, div,
				border_length = map_size / 10,
				psize = scale * MapHelpers.map2Pixel(border_length).x,
				pos = getRect();

			if (!map_size) {
				throw 'Dear Sysadmin, something went wrong with the map setup. It has size 0!';
			}

			//start coord
			var x_start = us.clamp(pos.x, 0, map_size),
				y_start = us.clamp(pos.y, 0, map_size),
				//amount
				x_count = Math.ceil(pos.w / border_length),
				y_count = Math.ceil(pos.h / border_length),
				i, j;

			x_start -= x_start % border_length;
			y_start -= y_start % border_length;

			for (i = 0; i <= x_count; i++) {
				for (j = 0; j <= y_count; j++) {

					coords = [x_start + (border_length * i), y_start + (border_length * j)];
					pixels = MapHelpers.map2Pixel.apply(MapTiles, coords);
					sea_id = WMap.getSea(coords[0], coords[1]).join('');

					if (!doc.getElementById(type + '_sea_' + sea_id)) {
						div = doc.createElement('div');

						div.style.width = psize + 'px';
						div.style.height = psize + 'px';
						div.className = 'm_border';
						div.id = type + '_sea_' + sea_id;
						div.style.left = pixels.x * scale + 'px';
						div.style.top = pixels.y * scale + 'px';
						div.innerHTML = sea_id;

						fragment.appendChild(div);
					}
				}
			}

			elm.layer[0].appendChild(fragment);
		};

		/**
		 * @param {Object} options options_hash center_on_current_town true || false [defaults to true]
		 */
		this.refresh = function (options) {
			var center_town = (options && typeof options.center_on_current_town !== 'undefined') ? options.center_on_current_town : true;
			elm.layer.empty();
			this.fillCanvas(center_town);
			$.Observer(GameEvents.minimap.refresh).publish();
		};

		this.scrollMapBy = function (diff) {
			refreshAndScrollMapTo({
				'x': mapScroll.x + diff.x - (c_w >> 1), // jshint ignore:line
				'y': mapScroll.y + diff.y - (c_h >> 1)  // jshint ignore:line
			});
		};

		this.zoomOut = function () {
			_self.fillCanvas(true);
			$.Observer(GameEvents.map.zoom_out).publish();
			StrategicMapFilterFactory.openWindow();
		};

		this.zoomIn = function () {
			collapse();
			$.Observer(GameEvents.map.zoom_in).publish();
			StrategicMapFilterFactory.closeWindow();
		};

		this.delegateClick = function (e) {
			if (dblclick) {
				window.clearTimeout(dblclick);
				dblclick = false;
				handleDblClick(e);
			} else {
				dblclick = window.setTimeout(function () {
					refetchDataAndRefreshMap();
					$.Observer(GameEvents.minimap.mouse_events.mouse_up).publish();
					dblclick = false;
				}, 350);
			}
		};

		this.convertPositionToMinimapPosition = function (position) {
			return {
				x: position.x * scale,
				y: position.y * scale
			};
		};

		this.getMinimapPosition = function () {
			return {
				x: mapScroll.x,
				y: mapScroll.y
			};
		};

		this.getScale = function () {
			return scale;
		};

		/**
		 * Check if minimap is active to make sure not to do the updates when it is in the background and not active
		 */
		this.isMiniMapActive = function () {
			return $('#minimap').css('display') !== 'none';
		};

		this.setLastMousePos = function (pos_x, pos_y) {
			lastMousePos = {
				x: pos_x,
				y: pos_y
			};
		};
	};
	us.extend(window.GPMinimap.prototype, Backbone.Events, {});
}());
