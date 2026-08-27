/* global MM, TM, Layout, MapTiles, Game, Compass, GameEvents, FarmTownBars, Timestamp, JSON, WM, Backbone, us, CM,
HelperGame */
define('map/wmap', function() {
	'use strict';

	var MapHelpers = require('map/helpers');
	var MapMouseHandlersMixin = require('map/mixins/mouse_handlers');
	var CommandsHelper = require('helpers/commands');
	var TOWN_TYPE = require('enums/town_types');
	var UIScale = require('mobile/uiscale');

	/**
	 * This object is responsible for view and control of the scrollable map
	 */
	var WMap = {
		// GP-6829 MapTiles is undefined
		// Since a MapTiles access is triggered by an notification
		// which is loaded with every request this class could be uninitialized.
		// We have to quit every function if this class is not initialized
		initialized: false,

		chunkSize: 20,

		size: {},

		sea_id: [-1, -1],

		elm: {},

		// PIXELS!
		townPosition: {},

		// MAPCOORDS!
		islandPosition: {},

		marker_offset: {
			'x': 45,
			'y': 35
		},

		ajaxloader: null,

		map_size: null,

		scroll: {
			'x': undefined,
			'y': undefined
		},

		last_scroll_x: undefined,
		last_scroll_y: undefined,

		currently_scrolling: false,

		jQElm: {},

		dScroll: {},

		night_enabled: null,

		requested_frames: 0,

		_invalid_map_chunks_cache : [],

		_debounced_map_update_timeout: 500, // ms

		/**
		 * Initialize
		 *
		 * @param {Object} islands
		 * @param {Object} currentPosition
		 * @param {Number} map_size
		 * @param {Number} chunk_size
		 * @param {String} map_arrow_type
		 * @param {Object} data
		 * @param {Number} unit_time_to_arrival for new ui object to calculate unit arrival time must be passed to Compass
		 */
		initialize: function (islands, currentPosition, map_size, chunk_size, map_arrow_type, data, unit_time_to_arrival) {
			var that = this;

			this.initialized = true;

			currentPosition.islandType = parseInt(currentPosition.islandType, 10);
			currentPosition.x = parseInt(currentPosition.x, 10);
			currentPosition.y = parseInt(currentPosition.y, 10);

			this.map_size = map_size;
			this.enlarged_ui = HelperGame.getEnlargedUIActivated();
			this.coordinates_selector = this.enlarged_ui ? 'button_ocean_number_coordinates' : 'wgt_coordinates';
			this.cm_context = this.enlarged_ui ? 'enlarged_navigation_area' : 'layout_bulls_eye_area';

			// Remember needed html elements (jQuery wrapped) that will be manipulated
			this.elm = {
				'mover': $('#map'),
				'marker': $('#map_marker'),
				'wrapper': $('#map_wrapper'),
				'move_container': $('#map_move_container'),
				'map_movements': $('#map_movements'),
				'coord_popup': $('#mouse_coordinate_popup'),
				'town_d': $('#town_direction'),
				'sea_id': document.getElementById('sea_id'),
				'popup': $('#popup_div'),
				'popup_content': $('#popup_content'),
				'ocean_number': $('.ocean_number_box .ocean_number'),
				'ocean_number_mobile': $('.ocean_coordinates .ocean_number'),
				'coordinates': $('.ocean_coordinates .coordinates')
			};

			//bind event before map data is set because event is triggered in there
			this.registerEventListeners();

			this.ajaxloader = new window.GPAjax(Layout, false);

			this.mapData = new window.MapData(data);

			this.mapX = currentPosition.x;
			this.mapY = currentPosition.y;
			this.size = {
				'x': this.elm.wrapper.width(),
				'y': this.elm.wrapper.height()
			};

			MapTiles.initialize(this.mapData, islands, map_size);

			// Minimum and maximum allowed coordinates for scroll
			this.scrollBorder = MapTiles.getScrollBorder();

			function callback() {
				that.setCurrentTownPixelCoords();

				that.mapArrow = new Compass(unit_time_to_arrival,'compass', 'compass_point');
				that.initializeMouseEvents();
			}

			// load chunks
			var screenSize = MapHelpers.pixel2Map(this.size.x, this.size.y);

			this.mapData.checkReload(currentPosition.x, currentPosition.y, screenSize.x, screenSize.y, function () {
				var coords = MapTiles.correctCoordsForIsland(currentPosition);
				// trigger callback to get town pixel position etc.:
				callback();

				that.centerMapOnPos(coords.x, coords.y, true);
			});

			// Post initialize
			this.setupMapUpdateTimer();
			UIScale.setMapMoveContainerDimension();

			jQuery.fx.timer(this.mapMoveFrame.bind(this));
		},

		/**
		 * register event listeners for the map
		 */
		registerEventListeners : function() {
			var features = require('data/features');

			$.Observer(GameEvents.game.night).subscribe(['map_js'], function (event, data) {
				this.setNightMode(event, data.enabled);
			}.bind(this));

			$.Observer(GameEvents.map.refresh.all).subscribe(['map_js'], function() {
				this.refresh('all');
			}.bind(this));

			$.Observer(GameEvents.map.refresh.towns).subscribe(['map_js'], function() {
				MapTiles.updateCurrentPlayerCitySkin();
				this.refresh('towns');
			}.bind(this));

			$.Observer(GameEvents.town.town_switch).subscribe(['map_js'], function() {
				this.refreshBPVTooltips();
			}.bind(this));

			if (features.mapChunkBackboneNotifications()) {
				var invalidatedMapChunkCoordinates = MM.getModels().MapChunks[Game.player_id],
					mapChunkChangeHandler = function() {
						var chunks = invalidatedMapChunkCoordinates.getChunks();
						WMap.mapData.loadData(chunks, function() {});
						invalidatedMapChunkCoordinates.reset();
				};

				invalidatedMapChunkCoordinates.onChange(mapChunkChangeHandler);
			} else {
				$.Observer(GameEvents.notification.system.arrive).subscribe(['setTownName', 'map_js'], WMap.setTownNameCompleteEventHandler.bind(this));
				$.Observer(GameEvents.notification.system.arrive).subscribe(['farmConquered', 'map_js'], WMap.farmTownConquerdEventHandler.bind(this));
				$.Observer(GameEvents.notification.system.arrive).subscribe(['farmSatisfactionChanged', 'map_js'], WMap.updateCompleteMapEventHandler.bind(this));
				$.Observer(GameEvents.notification.system.arrive).subscribe(['mapChunkUpdated', 'map_js'], WMap.invalidateMapChunksEventHandler.bind(this));
			}

			/**
			 * get notifications if any BPV farm village is upgraded
			 */
			if (features.battlepointVillagesEnabled()) {
				var relation_collection = MM.getOnlyCollectionByName('FarmTownPlayerRelation');

				relation_collection.onExpansionStageChange(this, function(model) {
					this.refresh('towns');
				}.bind(this));
			}

			var alliance_pact_collection = MM.getOnlyCollectionByName('AlliancePact'),
				refresh_on_alliance_events = function() {
					WMap.mapData.clearCache();
					if(window.Minimap.isMiniMapActive()) {
						return;
					}
					WMap.updateCompleteMapEventHandler();
				};

			alliance_pact_collection.onAlliancePactChange(this, refresh_on_alliance_events);
			MM.getModels().Player[Game.player_id].onChangeAllianceMembership(this, refresh_on_alliance_events);

			var town_agnostic_colonization_movements = MM.getFirstTownAgnosticCollectionByName('MovementsColonization');

			town_agnostic_colonization_movements.unregisterFragmentEventSubscriber(this);
			town_agnostic_colonization_movements.registerFragmentEventSubscriber(this);

			CommandsHelper.onAnyColonizationInAllTownsChange(this, function() {
				this.refresh('towns');
			}.bind(this));

			var takeovers = MM.getOnlyCollectionByName('Takeover');
			takeovers.onTakeoversChange(this, this.refresh.bind(this, 'towns'));

			var towns_collection = MM.getOnlyCollectionByName('Town');
			towns_collection.onTownCountChange(this, function(town) {
				// having a callback function defined automatically implies a map refresh
				this.mapData.checkCache(town.getIslandX(), town.getIslandY(), 1, 1, function() {});
			}.bind(this));
		},

		/**
		 * Returns map size
		 *
		 * @return {Integer}
		 */
		getMapSize : function() {
			return this.map_size;
		},

		/**
		 * Returns map chunk size
		 *
		 * @return {Integer}
		 */
		getChunkSize : function() {
			return this.chunkSize;
		},

		/**
		 * Returns tile dimensions
		 *
		 * @return {Object}
		 *     {Integer} x
		 *     {Integer} y
		 */
		getTileDimensions : function() {
			return MapTiles.tileSize;
		},

		/**
		 * event handler for GameEvents night event.
		 *
		 * @param {Event} event
		 * @param {Boolean} enabled
		 */
		setNightMode: function (event, enabled) {
			if (!this.initialized) {
				return;
			}

			var setNight = function(state) {
				$('#map, #minimap_canvas').toggleClass('night', state);//New UI
				$('#map_night').toggle(state);
			};
			if (enabled !== this.night_enabled) {
				if (enabled && this.isNightModeEnabled()) {
					setNight(true);
				} else if (!enabled) {
					setNight(false);
				}

			}
			this.night_enabled = enabled;
		},

		isNightModeEnabled: function() {
			return MM.getModelByNameAndPlayerId('PlayerSettings').isMapNightModeEnabled();
		},

		/**
		 *
		 */
		setCurrentTownPixelCoords: function () {
			if (!this.initialized) {
				return;
			}

			var town = this.mapData.findTownInChunks(Game.townId);

			if (!town) {
				return;
			}

			var pixelCoords = MapHelpers.map2Pixel(town.x, town.y);
			this.islandPosition = {

				'x': town.x,
				'y': town.y
			};

			this.townPosition = {
				'x': town.ox + pixelCoords.x + this.marker_offset.x,
				'y': town.oy + pixelCoords.y + this.marker_offset.y
			};
		},

		setCurrentTown: function (town_id, town_position, island_position) {
			if (!this.initialized) {
				return;
			}
			this.town_id = town_id;
			this.townPosition = town_position;
			this.islandPosition = island_position;
			this.setCurrentTownPixelCoords();

			if (this.mapArrow) {
				this.mapArrow.move(null, this.mapPosition, this.townPosition);
			}
		},

		/**
		 * Centering of map after resize
		 */
		reCenter: function (diff, duration, callback) {
			if (!this.initialized) {
				return;
			}
			diff = diff || {
				'x': (this.size.x - this.elm.wrapper.width()) / 4,
				'y': (this.size.y - this.elm.wrapper.height()) / 4
			};
			duration = duration || 400;
			var frame = 15,
				count = 0,
				anim;
			//set new position
			this.last_move_x = 0;
			this.last_move_y = 0;

			function sin(x) {
				return Math.sin(x / Math.PI * 5);
			}
			WMap.refresh();

			// prevent mousedowns while animating:
			WMap.currently_scrolling = true;
			anim = window.setInterval(function () {
				var elapsed = sin((count += frame) / duration);

				WMap.mousemove({
					'clientX': -diff.x * elapsed,
					'clientY': -diff.y * elapsed
				});

				if (count >= duration) {
					window.clearInterval(anim);
					WMap.handlerUp({});
					if (typeof callback === 'function') {
						callback();
					}
				}
			}, frame);
		},

		/**
		 * Updates  size.x & size.y and calls function for centering map
		 */
		resize: function () {
			if (!this.initialized) {
				return;
			}
			var w = this.elm.wrapper.width(),
				h = this.elm.wrapper.height();

			// do nothing on tab change ... does not work with firebug enabled
			if (w === this.size.x && h === this.size.y) {
				return;
			}

			// update tile count if visible area has grown
			if (w > this.size.x || h > this.size.y) {
				MapTiles.tileCount = MapTiles.getTileCount();
			}
			WMap.reCenter();

			//update size.x & size.y
			this.size.x = w;
			this.size.y = h;
		},

		/**
		 * Set move container. There is a workaround for Opera browsers which
		 * do not allow CSS-Coordinates greater than 32768.
		 *
		 * @param {Number} left CSS left value
		 * @param {Number} top CSS top value
		 * @param {Boolean} [animate]  use $.animate() or not DEPRECATED
		 */
		setMoveContainerPos: function (left, top, animate) {
			if (!this.initialized) {
				return;
			}

			var tile_dimensions = this.getTileDimensions();

			left -= tile_dimensions.x;
			top -= tile_dimensions.y;

			// Workaround for Opera 9 bug (TODO: is this workaround still needed?)
			if (window.opera) {
				left = left - MapTiles.cssOffset.x;
				top = top - MapTiles.cssOffset.y;

				while (left > 2E4) {
					left -= 2E4;
					MapTiles.cssOffset.x += 2E4;
					MapTiles.setAllTilePixel();
				}
				while (left < -2E4) {
					left += 2E4;
					MapTiles.cssOffset.x -= 2E4;
					MapTiles.setAllTilePixel();
				}
				while (top > 2E4) {
					top -= 2E4;
					MapTiles.cssOffset.y += 2E4;
					MapTiles.setAllTilePixel();
				}
				while (top < -2E4) {
					top += 2E4;
					MapTiles.cssOffset.y -= 2E4;
					MapTiles.setAllTilePixel();
				}
			}

			// cache scroll value to get them without DOM access
			this.mapPosition = {
				x: left,
				y: top
			};
			if (animate) {
				this.currently_scrolling = true;
				this.elm.move_container.stop(true, true).animate({
					'left': left,
					'top': top
				}, 750, 'swing', function () {
					WMap.currently_scrolling = false;
				});
			} else {
				/* GPU accelerated map movemap. Kills the ipad, because of the size of the dom element holding the map
				 * Also creates artifacts on the desktop, most likely because of css top and left still used on other placed.
				 * For example, it may be used during chunk loading
				 * var pode_style = this.elm.move_container[0].style; // P lain O ld D om E lement
				 * if (pode_style.top && pode_style.left) {
				 * pode_style.top = '0';
				 * pode_style.left = '0';
				 * pode_style['-webkit-transform'] = 'translate3d(' + left + 'px,' + top + 'px, 0)';
				 * return;
				 * }
				 */
				this.elm.move_container.css({
					left: left,
					top: top
				});

                this.elm.map_movements.css({
                    left: left,
                    top: top
                });

				//this.elm.move_container[0].style['-webkit-transform'] = 'translate(' + left + 'px,' + top + 'px)';
				//this.elm.move_container[0].style['-webkit-transform'] = 'translate3d(' + left + 'px,' + top + 'px, 0)';
				//this.elm.move_container[0].style['transform'] = 'translate3d(' + left + 'px,' + top + 'px, 0)';
				//this.elm.move_container.css({'-o-transform': 'translate(' + left + 'px,' + top + 'px)'});
				//this.elm.move_container[0].style['-o-transform'] = 'translate(' + left + 'px,' + top + 'px)';
				//this.elm.move_container[0].style['-ms-transform'] = 'translate(' + left + 'px,' + top + 'px)';
			}
		},

		/**
		 * Sets the scroll values in this object. These are used to pan
		 * the map.
		 *
		 * @param {Number} x X coordinate
		 * @param {Number} y Y coordinate
		 */
		setScroll: function (x, y) {
			if (!this.initialized) {
				return;
			}
			this.scroll.x = us.clamp(x, this.scrollBorder.xMin, this.scrollBorder.xMax);
			this.scroll.y = us.clamp(y, this.scrollBorder.yMin, this.scrollBorder.yMax);
		},

		/**
		 * Set map position. Removes all tiles and creates them new.
		 * This function does not automatically reload map data.
		 *
		 * @param {Object} pos Position object with x (pixels!) and y (PIXELS!!) values
		 */
		setPixelPosition: function (pos) {
			if (!this.initialized) {
				return;
			}
			var mapCoords = MapHelpers.pixel2Map(pos.x, pos.y);

			this.mapX = mapCoords.x;
			this.mapY = mapCoords.y;

			//@todo WTF ?????
			MapTiles.tile = {
				'x': this.mapX,
				'y': this.mapY
			};

			this.setMoveContainerPos(-pos.x, -pos.y);

			if (this.scroll.x !== pos.x || this.scroll.y !== pos.y) {
				// only refresh the map, if it was scrolled. Otherwise the map will not change, if both towns are on the same
				// island (which is the req for not having to scroll on town switch)
				this.scroll = {
					'x': pos.x,
					'y': pos.y
				};
				this.refresh('all');
			}
		},

		/**
		 * @see MapTiles.colMove
		 * @see MapTiles.rowMove
		 */
		movesColumnsAndRows: function () {
			var colMoveValue, rowMoveValue,
				viewport_has_changed = false;
			if (!this.initialized) {
				return viewport_has_changed;
			}

			// colMove until tile position is equal to requested tile position
			while (this.mapX !== MapTiles.tile.x - 1) {
				colMoveValue = this.mapX < MapTiles.tile.x ? 1 : -1;
				MapTiles.colMove(colMoveValue);
				viewport_has_changed = true;
			}
			// rowMove until tile position is equal to requested tile position
			while (this.mapY !== MapTiles.tile.y - 1) {
				rowMoveValue = this.mapY < MapTiles.tile.y ? 1 : -1;
				MapTiles.rowMove(this.mapY < MapTiles.tile.y ? 1 : -1);
				viewport_has_changed = true;
			}

			return viewport_has_changed;
		},

		/**
		 * recreates map tiles
		 *
		 * @param {String} [type]
		 */
		refresh: function (type) {
			if (!this.initialized) {
				return;
			}

			WMap.mapData.createData(MapTiles.tile.x, MapTiles.tile.y, MapTiles.tileCount.x, MapTiles.tileCount.y, ['towns', 'wonders', 'islands']);
			var towns = WMap.mapData.getData(['towns', 'wonders', 'islands']);

			this.movesColumnsAndRows();

			if (type === 'town') {
				MapTiles.updateTownsForCurrentPosition();
			} else {
				MapTiles.recreate();
			}

			FarmTownBars.setVisibleTowns(towns);

			WMap.initFarmTownTimer(towns);
		},

		/**
		 * Converts tile coordinates to chunk coordinates
		 *
		 * @return {Object} {chunk: pos{x, y}, rel: pos{x, y} }
		 */
		toChunk: function (x, y) {
			var chunk_size = this.getChunkSize();

			return {
				'chunk': {
					'x': Math.floor((x / chunk_size)),
					'y': Math.floor((y / chunk_size))
				},
				'rel': {
					'x': x % chunk_size,
					'y': y % chunk_size
				}
			};
		},

		/**
		 * Centers the map on a pixel(!!) coordinate.
		 *
		 * @param {Number} x x-coordinate
		 * @param {Number} y y-coordinate
		 * @param {Boolean} checkReload (optional) false will reload map data if necessary (copied from the old function, will always be done when the param isn't set)
		 * @param {Function} callback (optional) function to be executed when the new position has been set
		 */
		centerMapOnPos: function (x, y, checkReload, callback) {
			if (!this.initialized) {
				return;
			}
			var offsetX = this.elm.wrapper.width() >> 1, // jshint ignore:line
				offsetY = this.elm.wrapper.height() >> 1, // jshint ignore:line
				mapCoords = MapHelpers.pixel2Map(x, y),
				that = this,
				setPos = function () {
					that.setPixelPosition({
						'x': x,
						'y': y
					});
					if (typeof callback === 'function') {
						callback();
					}

					that.updateMapCoordInfo();
				};

			if (typeof x !== 'number' || typeof y !== 'number') {
				throw new TypeError();
			}

			x -= offsetX;
			y -= offsetY;

			this.last_move_x = this.last_move_y = 0;

			if (!checkReload) {
				this.mapData.checkReload(mapCoords.x, mapCoords.y, MapTiles.tileCount.x, MapTiles.tileCount.y, function () {
					setPos();
				});
			} else {
				setPos();
			}
		},

		/**
		 * Initialize farm_town_timer
		 *
		 * @param {Array} towns
		 */
		initFarmTownTimer: function (towns) {
			if (!this.initialized) {
				return;
			}
			if (towns.hasOwnProperty('towns')) {
				towns = towns.towns;
			}

			var first_lootable_farmtown = null;
			var xy_nr;

			for (xy_nr in towns) {
				if (!towns.hasOwnProperty(xy_nr)) {
					continue;
				}
				var town = towns[xy_nr];
				if (this.isOwnFarmtownWithLootCooldownRunning(town)) {
					if (first_lootable_farmtown === null) {
						first_lootable_farmtown = town;
					} else {
						if (town.loot < first_lootable_farmtown.loot) {
							first_lootable_farmtown = town;
						}
					}
				}
			}

			if(first_lootable_farmtown) {
				this.setNewTimerForFarmTownLootCooldown(first_lootable_farmtown, towns);
			}
		},

		isOwnFarmtownWithLootCooldownRunning: function (town_element) {
			var town_type = MapHelpers.getTownType(town_element);

			if (town_type !== 'farm_town') {
				return false;
			}

			return town_element.relation_status === 1 && town_element.loot > Timestamp.now();
		},

		setNewTimerForFarmTownLootCooldown: function (farm_town_element, towns) {
			// delete existing timer
			if (WMap.farm_town_timer) {
				window.clearTimeout(WMap.farm_town_timer);
				delete WMap.farm_town_timer;
			}

			if (farm_town_element.loot < Timestamp.now()) {
				return;
			}
			var time = (farm_town_element.loot - Timestamp.now()) * 1000;

			//add the loot icon, init new timer for the next loot and refresh the map
			WMap.farm_town_timer = window.setTimeout(function loadReady() {
				// display icon
				WMap.addFarmTownLootCooldownIcon(farm_town_element.id);
				WMap.refresh();

				window.clearTimeout(WMap.farm_town_timer);
				delete WMap.farm_town_timer;

				// set new timer
				WMap.initFarmTownTimer(towns);
			}, time);
		},

		/**
		 * Update lootable_at in chunk data
		 *
		 * @param {Number} town_id
		 * @param {Number} satisfaction
		 * @param {Number} lootable_at
		 * @param {Number} last_looted_at
		 * @param {String} lootable_human
		 * @param {String} relation_status
		 * @param {Number} expansion_stage
		 */
		updateStatusInChunkTowns: function (town_id, satisfaction, lootable_at, last_looted_at, lootable_human, relation_status, expansion_stage) {
			if (!this.initialized) {
				return;
			}
			// this call updates the existing chunk data for the farm_town with newest data
			this.mapData.updateStatus(town_id, satisfaction, lootable_at, last_looted_at, lootable_human, relation_status, expansion_stage);
		},

		/**
		 * handle farmConquered Notification
		 *
		 * @param {Event} event
		 * @param {Object} notification
		 */
		farmTownConquerdEventHandler: function (event, notification) {
			if (!this.initialized) {
				return;
			}
			var farm_town_id;

			// compatibility for old system notifications with farm_town_id in param_str
			farm_town_id = notification.param_id > 0 ? parseInt(notification.param_id, 10) : parseInt(notification.param_str, 10);
			WMap.updateStatusInChunkTowns(farm_town_id, -1, -1, -1, '', 1);
			WMap.pollForMapChunksUpdate();
		},

		/**
		 * handle events which require complete map update (farmSatisfactionChanged && setTownName)
		 *
		 * @param {Event} event
		 * @param {Object} notification
		 */
		updateCompleteMapEventHandler : function(event, notification) {
			if (!this.initialized) {
				return;
			}

			this.pollForMapChunksUpdate();
		},

		/**
		 * handle events which require update of a chunk setTownName
		 *
		 */

		setTownNameCompleteEventHandler : function(event, notification) {
			if (!this.initialized) {
				return;
			}
			var chunk_info_str = notification.param_str;
			var data = JSON.parse(chunk_info_str);

			if (!data.town.id) {
				return;
			}

			var towns = MM.getModelsForClass("Town");
			var town = towns[data.town.id];

			this.pollForMapChunksUpdateWithCoord(town.getIslandX(), town.getIslandY());
		},

		/**
		 * handle all mapChunkUpdated events
		 * debounces all duplicate calls with the same data (using string comparison on the playload)
		 * the actual update is deferred by a timer, the time value is based on experimental experience
		 *
		 * @param {Event} event
		 * @param {Object} notification
		 */
		invalidateMapChunksEventHandler : function (event, notification) {
			// GP-13172 delete this method as soon as the mapChunks backbone model works
			var chunk_info_str = notification.param_str;

			if (!this.initialized || chunk_info_str === '') {
				return;
			}

			// Debounce multiple calls to this event handler with same chunk
			if (this._invalid_map_chunks_cache.indexOf(chunk_info_str) !== -1) {
				return;
			}
			this._invalid_map_chunks_cache.push(chunk_info_str);

			TM.once('update_invalid_map_chunks', this._debounced_map_update_timeout, function() {
				this._invalid_map_chunks_cache.forEach(function(chunk_string) {
					var data = JSON.parse(chunk_string);
					if (!data.chunk_x || !data.chunk_y) {
						return;
					}
					this.pollForMapChunksUpdateWithChunkCoords(data.chunk_x, data.chunk_y);
				}.bind(this));
			}.bind(this));
		},

		/**
		 * calculate sea id from coordinate
		 *
		 * @param {Number} x
		 * @param {Number} y
		 * @return {Array} sea_id
		 */
		getSea: function (x, y) {
			if (!this.initialized) {
				return [];
			}
			// x * 10 / map_size
			var tmp = 10 / this.map_size;
			var sea_x = ~~(x * tmp); // jshint ignore:line
			var sea_y = ~~(y * tmp); // jshint ignore:line
			return [sea_x, sea_y];
		},

		/**
		 * calculate coordinate of a sea (top-left corner)
		 *
		 * @param {Number} sea
		 * @return {Object} coord {x, y}
		 */
		getCoordsFromSea: function (sea) {
			if (!this.initialized) {
				return {};
			}
			var sea_y = sea % 10,
				sea_x = Math.floor(sea / 10);

			return {
				'x': Math.round((sea_x * MapTiles.mapSize) / 10),
				'y': Math.round((sea_y * MapTiles.mapSize) / 10)
			};
		},

		/**
		 * Updates the coordinate input fields and the ocean id.
		 * When no arguments are given, the center of the screen is used as new coordinate.
		 *
		 * @param {Number} x optional
		 * @param {Number} y optional
		 */
		updateMapCoordInfo: function (x, y) {
			if (!this.initialized) {
				return;
			}
			var displayCoords;
			if (x === undefined && y === undefined) {
				displayCoords = MapHelpers.pixel2Map(
					WMap.scroll.x + (WMap.size.x >> 1) + (MapTiles.tileSize.x >> 1), // jshint ignore:line
					WMap.scroll.y + (WMap.size.y >> 1) + (MapTiles.tileSize.y >> 1)); // jshint ignore:line
				x = displayCoords.x;
				y = displayCoords.y;
			}

			var wgt_coordinates = CM.get({main: 'new_ui', sub: this.cm_context}, this.coordinates_selector);

			if (wgt_coordinates) {
				wgt_coordinates.setX(x);
				wgt_coordinates.setY(y);
			}

			if (this.enlarged_ui) {
				this.elm.coordinates.html(wgt_coordinates.getX() + '/' + wgt_coordinates.getY());
			}

			var temp_sea_id = this.getSea(x, y).join('');

			if (this.sea_id !== temp_sea_id) {
				this.sea_id = temp_sea_id;
				this.elm.ocean_number.html(this.sea_id);
				this.elm.ocean_number_mobile.html(s(_('Ocean %1'), this.sea_id));
			}
		},

		mapJump: function (obj, windowsStayOpen, callback) {
			if (!this.initialized) {
				return;
			}
			var mapCoords = {},
				pos,
				tileSize = this.getTileDimensions(),
				onJumpFinish = function onJumpFinish() {
					if (typeof mapCoords.x !== 'number' || typeof mapCoords.y !== 'number') {
						mapCoords = MapHelpers.pixel2Map(pos.x, pos.y);
					}
					$.Observer(GameEvents.map.jump).publish({});

					//update coordinates visible in layout
					if (typeof callback === 'function') {
						callback();
					}
				};

			// close all open windows first if quest system or friend invite is not active
			if (!windowsStayOpen) {
				//GPWindowMgr.closeAll();
				WM.minimizeAllWindows(true);
			}

			// pixel or map?
			if (!obj) {
				mapCoords.x = this.getXCoord();
				mapCoords.y = this.getYCoord();

				pos = MapHelpers.map2Pixel(mapCoords.x, mapCoords.y);
			} else if (obj.x !== undefined && obj.y !== undefined) {
				mapCoords.x = obj.x;
				mapCoords.y = obj.y;
				pos = MapHelpers.map2Pixel(obj.x, obj.y);
			} else if (obj instanceof window.Town) { // ITown!
				mapCoords.x = obj.getIslandCoordinateX();
				mapCoords.y = obj.getIslandCoordinateY();
				pos = MapHelpers.map2Pixel(obj.getIslandCoordinateX(), obj.getIslandCoordinateY());
			}
			// center of tile
			if (pos) {
				pos.x -= tileSize.x >> 1; // jshint ignore:line
				pos.y -= tileSize.y >> 1; // jshint ignore:line
			}

			// town || wonder?
			if (obj) {
				if (obj.ix !== undefined && obj.iy !== undefined) {
					mapCoords.x = obj.ix;
					mapCoords.y = obj.iy;
				}
				// check for town,  get chunks otherwise
				this.mapData.checkReload(mapCoords.x, mapCoords.y, MapTiles.tileCount.x, MapTiles.tileCount.y, function () {
					var town, pixels;
					if (obj.id && obj.tp !== 'island' && obj.tp !== 'temple') {
						// real town
						town = WMap.mapData.findTownInChunks(obj.id);
						if (!town) {
							return;
						}
					} else {
						// fake town (e.g. wonder)
						town = {
							'x': obj.ix,
							'y': obj.iy,
							'islandType': WMap.mapData.findIslandTypeInChunks(obj.ix, obj.iy)
						};
					}
					// correct position
					pixels = MapTiles.correctCoordsForIsland(town);
					// go there
					WMap.centerMapOnPos(pixels.x, pixels.y, true, onJumpFinish);
				});
			} else {
				WMap.centerMapOnPos(pos.x, pos.y, false, onJumpFinish);
			}
		},

		getXCoord: function () {
			return CM.get({main: 'new_ui', sub: this.cm_context}, this.coordinates_selector).getX();
		},

		getYCoord: function () {
			return CM.get({main: 'new_ui', sub: this.cm_context}, this.coordinates_selector).getY();
		},

		/**
		 * setups the map chunk update cycle timer and handler
		 */
		setupMapUpdateTimer: function () {
			if (!this.initialized) {
				return;
			}
			//clear interval handle if not undefined
			if (WMap.mapUpdateIntervalTimerHandle !== undefined) {
				window.clearInterval(WMap.mapUpdateIntervalTimerHandle);
			}

			//create new interval timer
			// TODO use timer manager
			WMap.mapUpdateIntervalTimerHandle = window.setInterval(WMap.pollForMapChunksUpdate, Game.map_chunks_poll_time);
		},

		isMapInitializedAndHasFocus: function () {
            if (!WMap.initialized) {
                return false;
            }
            // if window has no focus, wait until window gets focus
            if (!Game.hasFocus) {
                Game.refreshMapOnFocus = true;
                return false;
            }

            return true;
		},

		/**
		 * poll server for map chunks updates
		 */
		pollForMapChunksUpdate: function() {
			WMap.pollForMapChunksUpdateWithCoord(WMap.mapX, WMap.mapY);
		},

		/**
		 * poll server for map chunks updates for certain island coordinates
		 */
		pollForMapChunksUpdateWithCoord: function (island_x, island_y) {
			if (!this.isMapInitializedAndHasFocus()) {
				return;
			}

			var x = parseInt(island_x, 10),
            	y = parseInt(island_y, 10);

			var size = MapHelpers.pixel2Map(WMap.size.x, WMap.size.y);
			//poll server
			WMap.mapData.checkCache(x, y, size.x, size.y);
		},

		pollForMapChunksUpdateWithChunkCoords: function (chunk_x, chunk_y) {
            if (!this.isMapInitializedAndHasFocus()) {
                return;
            }

            var chunk_coords = {
            	x: parseInt(chunk_x, 10),
                y: parseInt(chunk_y, 10)
			};

            WMap.mapData.loadData([chunk_coords]);
		},

		addFarmTownLootCooldownIcon: function (farm_town_id) {
			if (!this.initialized) {
				return;
			}
			$('#farm_town_' + farm_town_id).html('<div class="res_available"></div>');
		},

		removeFarmTownLootCooldownIconAndRefreshLootTimers: function (farm_town_id) {
			if (!this.initialized) {
				return;
			}
			var element = $('#farm_town_' + farm_town_id + ' .res_available');
			element.remove();
			this.refresh('towns');
		},

        /**
		 * Helper function for automation tests
		 * It is only called from the tests to check if island quest and current town are on the same island
		 *
         * @param town_id - the id of the island quest
         * @returns {*}
         */
		isTownOnSameIslandAsCurrentTown: function(town_id) {
			return this.areTownsOnSameIsland(Game.townId, town_id);
		},

        /**
		 * Helper function for automation tests
		 *
         * @param first_town_id
         * @param second_town_id
         * @returns {boolean}
         */
		areTownsOnSameIsland: function(first_town_id, second_town_id) {
			var first_town = this.mapData.findTownInChunks(first_town_id);
			var second_town = this.mapData.findTownInChunks(second_town_id, TOWN_TYPE.SPECIAL_TOWN);
			return (first_town.x === second_town.x && first_town.y === second_town.y);
		}
	};

	WMap = us.extend(WMap, MapMouseHandlersMixin);
	WMap = us.extend(WMap, Backbone.Events);
	window.WMap = WMap;

	/*
	 * TODO move this code below to GameEvents
	 */
	$(function () {
		Game.refreshMapOnFocus = false;
		Game.hasFocus = true;

		$(window).on('focus', function () {
			// this event may be triggered multiple times, but we reload only once
			if (Game.hasFocus) {
				return;
			}
			Game.hasFocus = true;
			if (Game.refreshMapOnFocus) {
				WMap.pollForMapChunksUpdate();
			}
		}).on('blur', function () {
			Game.hasFocus = false;
		});
	});

	return window.WMap;

});
