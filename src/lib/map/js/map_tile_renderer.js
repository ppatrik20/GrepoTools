/* global us, WMap, Game, GameEvents, ITowns, MM, DM, JSON, TM */

/*jshint bitwise: false*/
define('map/map_tile_renderer', function (require) {
	'use strict';

	var features = require('data/features');
	var FarmTownRendererMixin = require('farmtowns/map/mixin/farmtown_renderer');
	var AttackSpotRenderer = require('features/attack_spots/map/attack_spot_renderer');
	var Timestamp = require('misc/timestamp');
	var MapHelpers = require('map/helpers');
	var TOWN_TYPES = require('enums/town_types');
	var HelperPlayerHints = require('helpers/player_hints');
	var OlympusHelper = require('helpers/olympus');
	var Features = require('data/features');
	var TempleSizes = require('enums/temple_sizes');
	const DefaultColors = require('helpers/default_colors');

	var HINTS = {
		MAP_BEGINNERS_PROTECTION: 'map_beginners_protection',
		MAP_LAST_ATTACK_SMOKE: 'map_last_attack_smoke',
		MAP_REVOLT_CONQUEST_FIRES: 'map_revolt_conquest_fires',
		MAP_CASUAL_WORLD_BLESSING: 'map_casual_world_blessing'
	};

	/**
	 *  Handles everything which is related to the map tiles
	 */
	var MapTiles = {
		mapSize: null,

		islands: {},

		tileSize: {x: 256, y: 128},

		focussed_town_id: null,

		elm: {},

		// use 8 parts of the wonder graphic for 10 building steps
		wonder_stages: [-1, 0, 1, 1, 2, 2, 3, 4, 5, 6, 7],

		tile: {x: 0, y: 0},

		//test: reload queue
		queue_enabled: true,
		queue: [],

		d: document,

		// ft = farmTwon
		ftColors: ['910e08', '516b2e', 'dc4200'],

		//farm town offset
		ftOffset: {x: 27, y: 17},

		//island quest offset
		iq_offset: {x: 6, y: 6},

		//offset for the colonization and foundation icons
		colo_offset: {x: 30, y: -10},

		//offset for colonization spots
		colo_spot_offset: {x: 18, y: 18},

		temple_offset: {x: 90, y: 4},

		temple_protection_offset: {x: 67, y: 14},

		// flag pole offsets towards the farm towns
		ft_flagpole_offsets: [
			{top: -12, left: 15},
			{top: -12, left: 15},
			{top: -14, left: 14},
			{top: -14, left: 14},
			{top: -15, left: 15},
			{top: -15, left: 15}
		],

		// town offsets
		tOffset: {
			nw: {x: 9, y: 14},
			ne: {x: 17, y: 11},
			sw: {x: 10, y: 13},
			se: {x: 15, y: 13}
		},

		objSize: {
			'wonders': null,
			'towns': null
		},

		debug: {
			'show_coords_on_map': false
		},

		initialize: function (mapData, islands, map_size) {
			// remember needed html elements (jQuery wrapped) that will be manipulated
			this.elm = {
				tiles: $('#map_tiles'),
				towns: $('#map_towns'),
				islands: $('#map_islands'),
				wonders: $('#map_wonders'),
				attack_spots: $('#map_attack_spots')
			};

			this.mapSize = map_size;
			this.mapData = mapData;
			this.islands = islands;
			this.focussed_town_id = 0;

			this.tileBuffer = {'x': 3, 'y': 6}; // tile buffer specifies number of extra tiles, before it was {'x': 2, 'y': 6}
			this.tileCount = this.getTileCount();

			this.objSize.towns = {
				x: $('#towndummy').width(),
				y: $('#towndummy').height()
			};
			this.objSize.wonders = {
				x: $('#wonderdummy').width(),
				y: $('#wonderdummy').height()
			};

			var i = islands.length;
			while (i--) {
				if (!islands[i]) {
					continue;
				}
				this.objSize[i] = MapHelpers.map2Pixel(islands[i].width + 1, islands[i].height + 1);
			}
			/**
			 * This offset is needed for Opera comaptibility. Opera doesnt allow CSS coordinates < -32768. This offset is added on
			 * all tile coordinates and subtracted from map_move_container.
			 */
			this.cssOffset = {x: 0, y: 0};

			$.Observer(GameEvents.town.town_switch).subscribe(['map_tiles_js'], function (e, data) {
				MapTiles.highlightTown();

				if (Game.jump_to_town) {
					WMap.mapJump(ITowns.getTown(Game.townId), true);
				}
			});

			if (features.battlepointVillagesEnabled()) {
				this.attack_spot_renderer = AttackSpotRenderer;
				const models = {
					player_attack_spot: MM.getModelByNameAndPlayerId('PlayerAttackSpot')
				};
				const collections = {};

				collections.movements_units = MM.getOnlyCollectionByName('MovementsUnits');

				this.attack_spot_renderer.initialize({
					models: models,
					collections: collections,
					l10n: DM.getl10n('attack_spot')
				});
			}

			this.map_extra_infos = MM.getOnlyCollectionByName('MapExtraInfo');
			this.takeovers = MM.getOnlyCollectionByName('Takeover');
			this.updateCurrentPlayerCitySkin();
		},

		updateCurrentPlayerCitySkin: function () {
			var player_city_skins = MM.getOnlyCollectionByName('PlayerCitySkin'),
				selected_city_skin = player_city_skins.getSelectedCitySkin();

			this.current_city_skin = selected_city_skin ? selected_city_skin.getId() : null;
		},

		/**
		 * Helper function for tile count
		 */
		getTileCount: function () {
			var pos = MapHelpers.pixel2Map(WMap.elm.wrapper.width(), WMap.elm.wrapper.height());

			return {
				x: pos.x + this.tileBuffer.x,
				y: pos.y + this.tileBuffer.y
			};
		},

		/**
		 * Returns the max and min values allowed to scroll
		 *
		 * @return Object
		 */
		getScrollBorder: function () {
			// on old maps there might be islands where the origin equals the max coord of the map ...
			// see GP-3869.
			var buffer = {
				x: 4 * this.tileSize.x,
				y: 8 * this.tileSize.y
			};
			return {
				xMin: -((this.tileSize.x / 2)) - buffer.x,
				yMin: -this.tileSize.y / 2 - buffer.y,
				xMax: this.tileSize.x / 2 * (this.mapSize - this.tileCount.x) + buffer.x,
				yMax: this.tileSize.y * (this.mapSize - this.tileCount.y) + buffer.y
			};
		},

		/**
		 * @param pos Object {'x': Number, 'y': Number, 'islandType': Number}
		 */
		correctCoordsForIsland: function (pos) {
			var island, islandPixelPos = MapHelpers.map2Pixel(pos.x, pos.y);

			if (pos.islandType) {
				island = this.islands[pos.islandType];
			}

			if (!island) {
				// Island type unknown, try to find it by position
				island = WMap.mapData.findIslandInfo(pos.x, pos.y);
			}

			if (!island) {
				// Still unable to find the island, jump directly to position
				return {x: islandPixelPos.x + 64 - this.tileSize.x, y: islandPixelPos.y + 96 - this.tileSize.y};
			}

			var islandPixelSize = MapHelpers.map2Pixel(island.width, island.height);

			// scroll to island center:
			//
			// some notes:
			// - subtracting tilesize to center on tile, otherwise it would be
			//   the bottom left corner of the tile ...
			//
			// - centering offsets seem to be completely random.
			return {
				x: islandPixelPos.x + islandPixelSize.x / 2 - island.centering_offset_x - (this.tileSize.x),
				y: islandPixelPos.y + islandPixelSize.y / 2 - island.centering_offset_y - (this.tileSize.y)
			};
		},

		/**
		 * Get sprite image and x and y offset for a given coordinate
		 *
		 * @param x Number
		 * @param y Number
		 * @return Object
		 */
		getImage: function (x, y) {
			var data = this.mapData.get(x, y),
				island, island_type, offset, left, top;

			// if no map data is found the "undef" is set to indicate
			// that it might need to wait for data and queue the tile
			if (data === undefined) {
				return {
					'img': 'watertiles.png',
					'left': 0,
					'top': 0,
					'undef': true
				};
			}

			// Watertiles are tiles with transparency area
			// If the divisor is a power of 2, the modulo (%) operation can be done with:
			// modulus = numerator & (divisor - 1);
			// therefore: %4 -> &3
			left = ((data & 255) & 3) * this.tileSize.x;
			top = ((data & 255) >> 2) * this.tileSize.y;
			island_type = data >> 8;

			// Check first byte to see if it is water (0) or island (different value)
			if (!island_type) {
				return {
					img: 'watertiles.png',
					left: left,
					top: top
				};
			}

			// get the island size
			// this part of the map_renderer only can handle watertiles and
			// islands with a width of 1 tile - larger islands are rendered extra in
			// drawIslands function
			island = this.islands[island_type];

			if (island.width === 1 && !MapHelpers.isTempleTile(island_type)) {
				offset = MapHelpers.map2Pixel((data & 255) % (island.width), parseInt((data & 255) / island.width, 10));

				return {
					img: island.img,
					left: offset.x,
					top: offset.y,
					isIsland: true
				};
			}

			// on olympus worlds we also render water tiles underneth each island
			// to avoid 'holes' at the border of the map
			if (Features.isOlympusEndgameActive()) {
				return {
					img: 'watertiles.png',
					left: 768,
					top: 384
				};
			}

			return false;
		},

		/**
		 * Moves a column. Change x value for all tiles in one column.
		 *
		 * @param {Number} dir
		 */
		colMove: function (dir) {
			var tcx = this.tileCount.x,
				tcy = this.tileCount.y,
				tx = this.tile.x,
				ty = this.tile.y,
				tile,
				fragment = document.createDocumentFragment(),
				y = 0;

			var oldOffset = (dir === 1) ? tcx - 1 : 0,
				newOffset = (dir === 1) ? -1 : tcx;

			for (; y < tcy; y++) {
				// Find tile
				tile = this.getElementFromCoords(oldOffset + tx, y + ty) || document.createElement('div');

				if (!tile.parentNode) {
					tile.className = 'tile';
					fragment.appendChild(tile);
				} else {
					this.addTile(newOffset, y, fragment);
				}
				// Move tiles
				this.setXY(tile, newOffset + tx, y + ty);

			}

			this.tile.x -= dir;

			this.elm.tiles[0].appendChild(fragment);
			// Check if data needs to be reloaded
			this.mapData.checkReload(tx, ty, tcx, tcy, function () {
				MapTiles.checkQueue();
			});
		},

		/**
		 * Moves a row
		 *
		 * @param {Number} dir
		 */
		rowMove: function (dir) {
			var tcx = this.tileCount.x,
				tcy = this.tileCount.y,
				tx = this.tile.x,
				ty = this.tile.y,
				tile,
				fragment = document.createDocumentFragment(),
				x = 0;

			var oldOffset = (dir === 1) ? tcy - 1 : 0;
			var newOffset = (dir === 1) ? -1 : tcy;

			for (; x < tcx; x++) {
				// Find tile
				tile = this.getElementFromCoords(x + tx, oldOffset + ty) || document.createElement('div');
				if (!tile.parentNode) {
					tile.className = 'tile';
					fragment.appendChild(tile);
				}

				// Move tile
				this.setXY(tile, x + tx, newOffset + ty);
			}

			this.tile.y -= dir;

			this.elm.tiles.append(fragment);
			// Check if data needs to be reloaded
			this.mapData.checkReload(tx, ty, tcx, tcy, function () {
				MapTiles.checkQueue();
			});
		},

		/**
		 * Set CSS-coordinates for a given tile.
		 *
		 * @param HtmlElement tile
		 * @param Number x
		 * @param Number y
		 */
		setTilePixel: function (tile, x, y) {
			var pixel = MapHelpers.map2Pixel(x, y);
			tile.style.left = pixel.x + this.cssOffset.x + 'px';
			tile.style.top = pixel.y + this.cssOffset.y + 'px';
			return this;
		},

		/**
		 * Sets CSS-coordinates for all tile divs. This function is only used by Opera compatibility
		 *
		 */
		setAllTilePixel: function () {
			//TODO:
			$('div.tile').each(function (i, tile) {
				var id = $(tile).attr('id'), // can be tile_<x>_<y> can also be town_<n>
					tmp = id.split('_'),
					x = parseInt(tmp[1], 10),
					y = parseInt(tmp[2], 10);

				if (!isNaN(x) && !isNaN(y)) { // if x and y are real numbers
					this.setTilePixel(tile, x, y);
				}
			}.bind(this));
		},

		/**
		 * Recreates all map tiles.
		 *
		 */
		recreate: function () {
			// detach layer-container for DOM-operations
			var e = this.elm,
				fragment,
				container = $('#map_move_container').detach(),
				y = -this.tileBuffer.y,
				x = -this.tileBuffer.x,
				tcy = this.tileCount.y,
				tcx = this.tileCount.x;

			// empty all layers
			e.tiles[0].innerHTML = '';
			e.tiles[0].innerText = '';
			e.towns[0].innerHTML = '';
			e.islands[0].innerHTML = '';
			e.wonders[0].innerHTML = '';

			this.updateTownsForCurrentPosition();

			fragment = document.createDocumentFragment();

			// create all maptiles
			while (y++ < tcy) {
				while (x++ < tcx) {
					this.addTile(x, y, fragment);
				}
				x = -(this.tileBuffer.x >> 1);
			}

			e.tiles[0].appendChild(fragment);

			// re-attach container
			container.appendTo($('#map'));

		},

		/**
		 * Adds one map tile.
		 *
		 * @param x Number
		 * @param y Number
		 * @param fragment DocumentFragment
		 */
		addTile: function (x, y, fragment) {
			var tile = document.createElement('div');
			tile.className = 'tile';

			if (this.setXY(tile, x + this.tile.x, y + this.tile.y, true)) {
				fragment.appendChild(tile);
			}
		},

		/**
		 * Set id and tile background from a given coordinate
		 *
		 * @param {HTMLElement} tile
		 * @param {Number} x
		 * @param {Number} y
		 * @param {Boolean} add
		 */
		setXY: function (tile, x, y, add) {
			//TODO;
			var parent,
				// Check first byte to see if it is water (0) or island (different value)
				type = this.mapData.get(x, y) >> 8;
			if (!tile) {
				return false;
			}

			// it is faster to do these things while the tile is not inside the document.
			if (!add && (parent = tile.parentNode)) {
				parent.removeChild(tile);
			}

			tile.id = 'tile_' + x + '_' + y;

			// if it is Water OR a rock (width 1) OR olympus endgame map --> render
			// see getImage
			if (!type ||
				this.islands[type].width === 1 ||
				Features.isOlympusEndgameActive()) {

				this.setTilePixel(tile, x, y).updateTile(tile, x, y);
				if (parent) {
					parent.appendChild(tile);
				}
				return true;
			}

			// --> don't render
			return false;
		},

		/**
		 * Updates a tile.
		 *
		 * @param tile HtmlElement
		 * @param x Number
		 * @param y Number
		 */
		updateTile: function (tile, x, y) {
			var image = this.getImage(x, y),
				that = this;

			if (!image) {
				return;
			}
			//if no data present: add tiles to queue and check again later
			if (this.queue_enbled && image.undef) {
				this.queue.push({
					'tile': tile,
					'x': x,
					'y': y
				});
				if (!this.queueInterval) {
					this.queueInterval = window.setInterval(function () {
						that.checkQueue();
					}, 50);
				}
			}
			this.setBackground(tile, image, x, y);
		},

		setBackground: function (tile, image, x, y) {
			tile.style.backgroundImage = 'url(' + Game.img() + '/game/map/' + image.img + ')';
			tile.style.backgroundPosition = -image.left + 'px ' + -image.top + 'px';

			// Erase all child nodes
			if (this.debug.show_coords_on_map) {
				tile.innerHTML = x + '|' + y;
			}
		},

		checkQueue: function () {
			if (!this.queue.length) {
				window.clearInterval(this.queueInterval);
				delete this.queueInterval;
				return;
			}
			var tcx = this.tileCount.x,
				tcy = this.tileCount.y,
				tx = this.tile.x,
				ty = this.tile.y,
				b = this.setBackground,
				i = this.queue.length,
				ele, image;

			while (i--) {
				ele = this.queue[i];
				// check if tile should be visible or if it is from a previus screen:
				if (ele.x.between(tx, tx + tcx) && ele.y.between(ty, ty + tcy)) {
					image = this.getImage(ele.x, ele.y);

					if (image && !image.undef) {
						b(ele.tile, image);

						this.queue.splice(i, 1);
					}
				} else {
					this.queue.splice(i, 1);
				}
			}
		},

		/**
		 * Draws islands based on chunk.islands instead of chunk.tiles.
		 * Necessary because there might be islands which are not covered by the tiles.
		 * see GP-3869.
		 *
		 */
		drawIslands: function (islands) {
			var div, islandId, island, data, id, tiletype, pixels, size, is_temple_tile,
				fragment = document.createDocumentFragment();

			for (islandId in islands) {
				if (!islands.hasOwnProperty(islandId)) {
					continue;
				}

				island = islands[islandId];
				data = this.islands[island.type];
				is_temple_tile = MapHelpers.isTempleTile(island.type);

				if (is_temple_tile) {
					tiletype = 'templetile';
				} else {
					tiletype = 'islandtile';
				}

				id = tiletype + '_' + island.x + '_' + island.y;

				if (document.getElementById(id)) {
					continue;
				}

				pixels = MapHelpers.map2Pixel(island.x, island.y);
				size = MapHelpers.map2Pixel(data.width + 2, data.height + 2);

				div = document.createElement('div');

				div.style.left = pixels.x + this.cssOffset.x + 'px';
				div.style.top = pixels.y + this.cssOffset.y + 'px';

				div.id = id;

				if (!is_temple_tile) {
					div.style.backgroundImage = 'url(' + Game.img() + '/game/map/' + data.img + ')';
					div.style.width = size.x + 'px';
					div.style.height = size.y + 'px';
					div.className = 'tile ' + tiletype;
				} else {
					div.className = 'tile ' + tiletype + ' ' + data.img;
				}

				if (this.debug.show_coords_on_map) {
					div.innerHTML = island.x + '|' + island.y;
				}

				fragment.appendChild(div);
			}

			this.elm.tiles.append(fragment);

			return this;
		},


		/**
		 * Updates all towns according to current position
		 */
		updateTownsForCurrentPosition: function () {
			var data = this.mapData.getData(['towns', 'wonders', 'islands']);

			this.drawIslands(data.islands);
			this.updateTowns(data.towns);
			this.updateWonders(data.wonders);
			this.updateIslandInfos(data.islands);
			this.updateAttackSpots();
		},

		/**
		 * highlights the active town on the map ... old focus-div is removed.
		 * this represents a white circle around the current town
		 */
		highlightTown: function (pos) {
			var highlight_type = 'active',
				islandOffset, tOffset, town;

			if (arguments.length !== 1) {
				town = WMap.mapData.findTownInChunks(Game.townId);

				if (!town) {
					this.removeHighlight2(highlight_type);
					return;
				}
				islandOffset = MapHelpers.map2Pixel(town.x, town.y);
				tOffset = this.tOffset[town.dir];
				pos = {
					'x': this.cssOffset.x + islandOffset.x + town.ox + tOffset.x,
					'y': this.cssOffset.y + islandOffset.y + town.oy + tOffset.y
				};
			}

			pos.x -= 3;
			pos.y += 8;

			this.highlight2(highlight_type, pos);
		},

		/*
		 * "focusedtown" is the arrow on top of a town
		 */
		focusTown: function (id) {
			var town = WMap.mapData.findTownInChunks(id),
				highlight_type = 'focussed',
				pos, islandOffset;

			if (!town) {
				this.removeHighlight2(highlight_type);
				return;
			}

			this.focussed_town_id = id;

			islandOffset = MapHelpers.map2Pixel(town.x, town.y);
			pos = {
				x: this.cssOffset.x + islandOffset.x + town.ox + 32,
				y: this.cssOffset.y + islandOffset.y + town.oy - 20
			};

			this.highlight2(highlight_type, pos);
		},

		removeHighlight2: function (type) {
			$('#' + type + 'town').remove();
		},

		highlight2: function (type, pos) {
			var focus = document.getElementById(type + 'town') || document.createElement('div');

			focus.id = type + 'town';
			focus.style.left = pos.x + 'px';
			focus.style.top = pos.y + 'px';

			this.elm.towns[0].appendChild(focus);
		},

		/**
		 * wraps createTownDiv to enable a seperate code path for
		 * the new farm towns in the Battle point village system
		 *
		 * if the feature is disabled, use the old code path
		 */
		battlepointVillageCreateTownDivProxy: function (town, player_current_town) {
			const town_type = MapHelpers.getTownType(town);

			if (town_type === TOWN_TYPES.FARM_TOWN && features.battlepointVillagesEnabled()) {
				return this.createBattlepointVillageFarmTown(town, player_current_town);
			}

			return this.createTownDiv(town, player_current_town);
		},

		getFarmTownFlagPoleOffsets: function (expansion_stage) {
			return this.ft_flagpole_offsets[expansion_stage - 1];
		},

		getEncodedTownDataForHref: function (town, town_type) {
			var id = town_type === TOWN_TYPES.FREE ? null : town.id,
				result = {
					id: id,
					ix: town.x,
					iy: town.y,
					tp: town_type
				};

			if (town_type === TOWN_TYPES.FREE) {
				if (town.invitation_spot) {
					result.inv_spo = true;
				}
				result.nr = town.nr;
			}

			if (town.player_town_id !== undefined && town.player_town_id !== null) {
				result.player_town_id = town.player_town_id;
			}

			if (town.nr !== undefined && town.nr !== null) {
				result.number_on_island = town.nr;
			}

			return '#' + btoa(JSON.stringify(result));
		},

		createDominationAreaMarker: function (town, link) {
			var glow = document.createElement('div'),
				wrapper = document.createElement('div'),
				town_type = TOWN_TYPES.DOMINATION_AREA_MARKER,
				town_subtype = town.subtype ? town.subtype : '';

			glow.className = (town_type + '_glow ' + town_subtype);

			wrapper.className = town_type + ' ' + town_subtype;

			//link is appended last, so the map_mouse_handler uses it for the mouseOver check
			wrapper.appendChild(glow);
			wrapper.appendChild(link);

			return wrapper;
		},

		createTownOverlay: function (opts) {
			var overlay = document.createElement('div');
			overlay.className = opts.className;
			overlay.style.left = opts.left + 'px';
			overlay.style.top = opts.top + 'px';
			overlay.style.position = 'absolute';

			return overlay;
		},

		/**
		 * Create the DOM elements for all kind of "towns", which are:
		 * * Player Towns,
		 * * Invitations Spots
		 * * FarmTowns (not BPV system)
		 * * Special Towns
		 * * Free Spots
		 *
		 * Farm Towns for BPV are rendered in a special Mixin class
		 *
		 * @param Object town
		 * @param Object player_current_town
		 */
		createTownDiv: function (town, player_current_town) {
			// stores generated DOM nodes as array
			var result = [];
			var ongoing_colonizations_count = MapHelpers.getOnGoingColonizationsCount();

			const town_type = MapHelpers.getTownType(town);
			const ghost_town = MapHelpers.isGhostTown(town);
			var id = town_type + '_' + town.id;
			var colonized_town = false;

			if (town_type === TOWN_TYPES.FREE && ongoing_colonizations_count > 0) {
				colonized_town = MapHelpers.getColonizedTown(town);
			}

			// if we already have the div in the DOM, bail
			if (document.getElementById(id)) {
				return false;
			}

			// bail on special towns without island_quest_data
			if (town_type === TOWN_TYPES.SPECIAL_TOWN && !town.island_quest_data) {
				//  Do not draw special towns
				return false;
			}

			// get the final pixel coords, do do some offsetting / corrections

			// town.x / town.y identify the island not the town on the island
			var islandOffset = MapHelpers.map2Pixel(town.x, town.y);
			var offsetX = this.cssOffset.x + islandOffset.x;
			const offsetY = this.cssOffset.y + islandOffset.y;
			let tOffset;

			/**
			 * Colonized towns and colonization spots get a special offset
			 * Island quest and farmtown offsets are based on the size of the domination marker (60x60)
			 * Town offset is determined by their direction on the map
			 *
			 * Domination spots are excluded as they are the biggest icon on the map
			 */
			if (colonized_town) {
				tOffset = this.colo_offset;
			} else if (town_type === TOWN_TYPES.FREE) {
				tOffset = this.colo_spot_offset;
			} else if (town_type === TOWN_TYPES.SPECIAL_TOWN) {
				tOffset = this.iq_offset;
			} else if (town_type !== TOWN_TYPES.DOMINATION_AREA_MARKER) {
				tOffset = this.tOffset[town.dir] || this.ftOffset;
			}

			// I have no idea what these offsets do, actually
			var tl = offsetX + town.ox,
				tt = offsetY + town.oy;

			//offsets for new bg-images
			if (tOffset) {
				tl += tOffset.x;
				tt += tOffset.y;
			}
			// tl and tt contain the final pixel coords for the
			// element to go to top: <tt>px and left: <tl>px

			var wrapper;

			// create and set position
			var link = document.createElement('a');
			link.className = 'tile';
			link.href = this.getEncodedTownDataForHref(town, town_type);


			// farm town get additional classnames
			// they also get a wrapper here, other town type do no get it
			if (town_type === TOWN_TYPES.FARM_TOWN) {
				let additional_classnames = '';

				if (town.relation_status === 1) {
					additional_classnames = ' farmtown_owned';
					// if on the same island like current town
					if (town.x === player_current_town.getIslandCoordinateX() && town.y === player_current_town.getIslandCoordinateY()) {
						additional_classnames += ' farmtown_owned_on_same_island';
					}
				} else {
					if (town.x === player_current_town.getIslandCoordinateX() && town.y === player_current_town.getIslandCoordinateY()) {
						additional_classnames += ' farmtown_not_owned_on_same_island';
					}

				}

				// wrap the link in a wrapper
				wrapper = document.createElement('div');
				wrapper.className = 'tile' + additional_classnames;
				wrapper.appendChild(link);
				wrapper.style.left = tl + 'px';
				wrapper.style.top = tt + 'px';
				wrapper.id = id;

			} else if (town_type === TOWN_TYPES.DOMINATION_AREA_MARKER) {
				wrapper = this.createDominationAreaMarker(town, link);
				wrapper.style.left = tl + 'px';
				wrapper.style.top = tt + 'px';
				wrapper.id = id;
			} else {
				link.style.left = tl + 'px';
				link.style.top = tt + 'px';
				link.id = id;
			}

			// push either the wrapper or the link to the results
			result.push(wrapper || link);

			// create flags
			var left = offsetX + ~~(town.ox) + ~~(town.fx),
				top = offsetY + ~~(town.oy) + ~~(town.fy),
				flag,
				flagpole,
				ftr = town.relation_status,
				color = ghost_town ? DefaultColors.getGhostTownColor() : (town.fc || this.ftColors[ftr]);

			// flagpole for farm-, ghost- and normal towns
			if ((town.invitation_spot && !colonized_town) || town_type === TOWN_TYPES.TOWN || town_type === TOWN_TYPES.FARM_TOWN) {
				// make flagpole clickable for farm towns
				if (town_type === TOWN_TYPES.FARM_TOWN) {
					flagpole = document.createElement('a');
					flagpole.href = this.getEncodedTownDataForHref(town, town_type);
				} else {
					flagpole = document.createElement('div');
				}
				flagpole.className = 'flagpole town ' + (ghost_town && DefaultColors.isDefaultGhostTownColor(color) ? 'ghost_town' : '');

				//TODO:
				if (town_type === TOWN_TYPES.FARM_TOWN) {
					left += 24;
					top += 18;
				}
			}

			// draw extra states on towns
			//
			// highest priority is newbie protection (these town can not have any attack smoke or fire anyways)
			// revolts beat attacking smoke

			if (town_type === TOWN_TYPES.TOWN) {
				var has_noob_protection = town.protection_end && town.protection_end > Timestamp.now(),
					has_blessing = town.blessed_town,

					// revolts
					revolts = this.takeovers.getAllRevoltsForSpecificTown(town.id),
					has_revolts = revolts !== null && revolts.length > 0,

					// conquests
					has_incoming_conquests = this.takeovers.getIncomingTakeOverForSpecificTown(town.id) !== null,
					has_outgoing_conquests = this.takeovers.getOutgoingTakeOverForSpecificTown(town.id) !== null,
					recent_attack = this.map_extra_infos.hasRecentAttackOnTown(town.id);

				if (has_noob_protection && HelperPlayerHints.isHintEnabled(HINTS.MAP_BEGINNERS_PROTECTION)) {
					// raw newbie protection element (shield)
					result.unshift(
						this.createTownOverlay({
							className: ['city_shield', town.dir, 'lvl' + town.size].join(' '),
							left: tl - 25,
							top: tt - 20
						})
					);
				} else if ((has_incoming_conquests || has_outgoing_conquests || has_revolts) &&
					HelperPlayerHints.isHintEnabled(HINTS.MAP_REVOLT_CONQUEST_FIRES)) {
					// draw fire: depends on the revolt state in own and other cities. There are two images: if the revolt is uprising or already running
					var level = 1;
					if (has_revolts) {
						level = this.takeovers.hasRunningRevoltsForSpecificTown(town.id) ? 2 : 1;
					}

					var left_correct = level === 1 ? -10 : -10;
					var top_correct = level === 1 ? -30 : -20;
					result.unshift(
						this.createTownOverlay({
							className: ['city_fire' + level, town.dir, 'lvl' + town.size].join(' '),
							left: tl + left_correct,
							top: tt + top_correct
						})
					);
				} else if (recent_attack && HelperPlayerHints.isHintEnabled(HINTS.MAP_LAST_ATTACK_SMOKE)) {
					// draw smoke, if we have successful attacks (this is linked to the attack report and time)
					result.unshift(
						this.createTownOverlay({
							className: ['city_smoke', town.dir, 'lvl' + town.size].join(' '),
							left: tl - 5,
							top: tt - 20
						})
					);
				}

				if (has_blessing && !has_noob_protection &&
					HelperPlayerHints.isHintEnabled(HINTS.MAP_CASUAL_WORLD_BLESSING)) {
					result.unshift(
						this.createTownOverlay({
							className: ['city_shield_blessing', town.dir, 'lvl' + town.size].join(' '),
							left: tl - 25,
							top: tt - 20
						})
					);
				}
			}

			if (flagpole) {
				// create, style and append a flag container
				flag = document.createElement('div');
				flag.id = town_type + '_flag_' + town.id;
				var ftr_class = isNaN(ftr) ? '' : ' ftr_' + ftr;
				flag.className = 'flag ' + (town.css_class || town_type + ftr_class);

				if (color && town_type !== TOWN_TYPES.FREE) {
					flag.style.backgroundColor = '#' + color;
				} else if (town_type === TOWN_TYPES.FARM_TOWN) {
					flag.style.backgroundColor = '#' + this.ftColors[0];
				}

				if (town_type === TOWN_TYPES.FARM_TOWN) {
					var flag_pole_offset = this.getFarmTownFlagPoleOffsets(town.expansion_stage);
					flag.style.left = left + flag_pole_offset.left + 'px';
					flag.style.top = top + flag_pole_offset.top + 'px';
				} else {
					flag.style.left = left + 'px';
					flag.style.top = top + 'px';
				}

				if (town.flag_type) {
					flag.style.backgroundImage = 'url(' + Game.img() + '/game/flags/map/flag' + town.flag_type + '.png)';
				}

				// append flag if a flagpole is needed
				flag.appendChild(flagpole);

				// push on stack
				result.push(flag);
			}

			// set background image to town container and append it
			if ((town.invitation_spot && !colonized_town) || town_type === TOWN_TYPES.TOWN || town_type === TOWN_TYPES.INV_SPO) {
				link.className += ' ' + town.dir + ' lvl' + ((town.invitation_spot || town_type === TOWN_TYPES.INV_SPO) ? '0' : town.size);
				link.className += ' ' + town_type + '_' + town.x + '_' + town.y + '_' + town.nr;
				link.className += ' ' + (ghost_town ? 'ghost_town' : (town.css_class === 'own_town' ? this.current_city_skin : town.skin));

				// set a highlight on the current town
				if (Game.townId === town.id) {
					this.highlightTown({
						'x': tl,
						'y': tt
					});
				}

				if (town.id === this.focussed_town_id) {
					this.focusTown(town.id);
				}

			} else if (town_type === TOWN_TYPES.FREE) {
				if (colonized_town) {
					if (colonized_town.hasFoundationStarted()) {
						link.className += ' foundation_map_icon';
					} else {
						link.className += ' coloship_map_icon';
					}

				} else {
					link.className += ' found';
				}
			} else if (wrapper && town_type !== TOWN_TYPES.DOMINATION_AREA_MARKER) {
				wrapper.className += ' ft' + town.expansion_stage;

				// using Timestamp.now() here clearly indicates this code is called way to often
				if (town.loot && parseInt(town.loot, 10) <= Timestamp.now()) {
					wrapper.innerHTML += ('<span class="res_available"></span>');
				}
			}

			if (town_type === TOWN_TYPES.TOWN && town.css_class !== 'own_town') {
				// if on the same island like current town
				if (town.x === player_current_town.getIslandCoordinateX() && town.y === player_current_town.getIslandCoordinateY()) {
					link.className += ' foreign_town_on_same_island';
				}
			}

			if (town_type === TOWN_TYPES.TOWN && town.reservation) {
				link.className += ' reservation_tool ' + town.reservation.state + ' ' + town.reservation.type;

				var timeout = (town.reservation.expire_date - Timestamp.now()) * 1000;
				TM.once('town_reservation_' + town.id, timeout, function () {
					$('.' + link.className.split(' ').join('.')).removeClass('reservation_tool reserved own');
				}.bind(this));
			}

			if (town_type === TOWN_TYPES.SPECIAL_TOWN && town.island_quest_data) {
				link.className += ' ' + town.island_quest_data.island_quest_base_name + ' island_quest island_quest_x_y_nr_' + town.x + '_' + town.y + '_' + town.nr;
			}

			return result;
		},

		createWonderDiv: function (wonder) {
			var islandOffset = MapHelpers.map2Pixel(wonder.ix, wonder.iy),
				id = 'wonder_' + wonder.ix + '_' + wonder.iy, a;

			if (document.getElementById(id)) {
				return false;
			}

			// create and style wonder container
			a = document.createElement('a');
			a.id = id;
			a.className = 'tile ' + wonder.wt;
			a.title = wonder.pop || _('Construction site for a World Wonder');
			a.href = '#' + btoa('{"ix":' + wonder.ix + ',"iy":' + wonder.iy + ',"tp":"wonder"}');
			a.style.left = this.cssOffset.x + islandOffset.x + wonder.ox + 'px';
			a.style.top = this.cssOffset.y + islandOffset.y + wonder.oy + 'px';

			// set background image to town container and append it
			if (wonder.wt !== 'wbg' && wonder.wt !== null && this.wonder_stages[wonder.stg] >= 0) {
				a.style.backgroundPosition = '-' + (this.wonder_stages[wonder.stg] * 99) + 'px 0px';
			} else if (wonder.stg === 0) {
				a.className += ' lvl0';
			} else {
				a.className += ' empty';
			}

			return a;
		},

		/**
		 * Creates an island div
		 *
		 * @param Object island
		 */
		createIslandDiv: function (island) {
			const offset = MapHelpers.map2Pixel(island.x, island.y),
				island_type = this.islands[island.type],
				iconoffset = MapHelpers.map2Pixel(island_type.width, island_type.height),
				// pixel coords
				left = this.cssOffset.x + offset.x + (iconoffset.x >> 1) + 'px',
				top = this.cssOffset.y + offset.y + (iconoffset.y >> 1) + 'px',
				// island object as string
				str = '{"tp":"island","id":' + island.id + ',"ix":' + island.x + ',"iy":' + island.y + ',"res":"' + island.res + '"}';

			var wrapper = document.createElement('div');
			wrapper.id = 'island_' + island.x + '_' + island.y;
			wrapper.className = 'islandinfo islandinfo-' + island.type + ' islandinfo-' + island.res;
			wrapper.style.left = left;
			wrapper.style.top = top;
			wrapper.innerHTML = '<a class="gp_island_link" href="#' + btoa(str) + '"></a><div class="islandinfo_malus"></div>';

			return wrapper;
		},

		/**
		 * Updates all towns according to position (x,y) and range (width,height)
		 *
		 * @param {Array} rect [x, y, width, height]
		 */
		updateTowns: function (towns) {
			var fragment = document.createDocumentFragment(),
				town,
				townType,
				elemToDelete,
				arr,
				j,
				xy_nr,
				player_current_town = ITowns.getTown(Game.townId);

			// Move towns and add new towns
			for (xy_nr in towns) {
				if (!towns.hasOwnProperty(xy_nr)) {
					continue;
				}
				town = towns[xy_nr];
				townType = MapHelpers.getTownType(town);

				// Check if div exists
				if (!document.getElementById(townType + '_' + town.id)) {
					if (townType === 'town') {
						elemToDelete = $('.inv_spo_' + town.x + '_' + town.y + '_' + town.nr);
						if (elemToDelete.length) {
							elemToDelete.remove();
						}
					} else if (townType === 'inv_spo') {
						elemToDelete = $('.town_' + town.x + '_' + town.y + '_' + town.nr);
						if (elemToDelete.length) {
							town = null;
						}
					}

					if (town) {
						arr = this.battlepointVillageCreateTownDivProxy(town, player_current_town);

						// DOM nodes from arr get appended in REVERSE order by this loop
						j = arr.length;
						while (j--) {
							fragment.appendChild(arr[j]);
						}
					}
				}
			}

			this.elm.towns[0].appendChild(fragment);

			return this;
		},

		/**
		 * Updates all wonders according to position (x,y) and range (width,height)
		 *
		 * @param {Array} rect [x, y, width, height]
		 */
		updateWonders: function (wonders) {
			if (!wonders) {
				return this;
			}
			var wonder,
				fragment = document.createDocumentFragment(),
				i = wonders.length,
				wonderElement;

			// Move wonders and add new wonders
			while (i--) {
				wonder = wonders[i];
				if (wonder.ix === undefined && wonder.iy === undefined) {
					continue;
				}
				// Check if div exists
				if ((wonderElement = this.createWonderDiv(wonder))) {
					fragment.appendChild(wonderElement);
				}
			}

			this.elm.wonders.append(fragment);

			return this;

		},

		/**
		 * Updates all islands infos according to position (x,y) and range (width,height)
		 *
		 * @param rect Array with [x, y, width, height]
		 */
		updateIslandInfos: function (islandinfos) {
			if (!islandinfos) {
				return this;
			}

			var fragment = document.createDocumentFragment();

			for (var islandId in islandinfos) {
				if (!islandinfos.hasOwnProperty(islandId)) {
					continue;
				}

				var island = islandinfos[islandId],
					child,
					pixels = MapHelpers.map2Pixel(island.x, island.y);

				if (MapHelpers.isTempleTile(island.type)) {
					if (!document.getElementById('map_temple_' + island.x + '_' + island.y)) {
						child = OlympusHelper.generateTempleLinkForMap(island, this.temple_offset);

						if (island.temple_protection_ends && island.temple_protection_ends > Timestamp.server()) {
							var temple = OlympusHelper.getTempleByIslandXAndIslandY(island.x, island.y),
								temple_size = temple.getTempleSize(),
								left = pixels.x,
								top = pixels.y,
								class_name = 'city_shield_blessing ' +
									'temple_shield_' + island.x + '_' + island.y;

							if (temple_size === TempleSizes.SMALL) {
								left += this.temple_protection_offset.x;
								top += this.temple_protection_offset.y;
							} else {
								class_name += ' ' + temple_size;
								class_name += temple_size === TempleSizes.LARGE ? ' ' + temple.getGod() : '';
							}

							fragment.appendChild(
								this.createTownOverlay({
									className: class_name,
									left: left,
									top: top
								})
							);
						} else {
							var city_shield = document.querySelector('.temple_shield_' + island.x + '_' + island.y);
							if (city_shield) {
								city_shield.remove();
							}
						}
					}
				} else {
					if (!document.getElementById('island_' + island.x + '_' + island.y)) {
						child = this.createIslandDiv(island);
					}
				}

				if (child) {
					fragment.appendChild(child);
				}
			}

			this.elm.islands.append(fragment);

			return this;
		},

		/**
		 *	draw attack spots, if the game has any
		 */
		updateAttackSpots: function () {
			if (!features.battlepointVillagesEnabled()) {
				return;
			}

			if (!this.attack_spot_renderer.canRenderAttackSpot()) {
				// remove attack spot if we can not render it
				if (this.elm.attack_spots.children().length > 0) {
					this.elm.attack_spots.remove();
				}
				return;
			}

			// bail if the spots are already rendered
			if (this.elm.attack_spots.children().length > 0) {
				return;
			}

			var fragment = document.createDocumentFragment();
			fragment = this.attack_spot_renderer.addDOMNodesToFragment(fragment);
			this.elm.attack_spots.append(fragment);
			this.attack_spot_renderer.bindTooltip();
		},

		/**
		 * Helper to get a tile HtmlElement by tile coordinates (x and y).
		 *
		 * @param x Number
		 * @param y Number
		 * @return HtmlElement
		 */
		getElementFromCoords: function (x, y) {
			var id = 'tile_' + x + '_' + y;

			return document.getElementById(id);
		}
	};

	/**
	 * Extend this class with a mixin and publish
	 */
	window.MapTiles = us.extend(MapTiles, FarmTownRendererMixin);
	return window.MapTiles;
});
