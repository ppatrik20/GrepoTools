/* global WMap, MapTiles, makeDWord, Game, GameEvents */
/**
 * This class holds all map data.
 */
window.MapData = function MapData(data) {
	'use strict';

	var MapHelpers = require('map/helpers'),
		TOWN_TYPE = require('enums/town_types'),
		DateHelper = require('helpers/date');

	// constants used to generate the island settlecount
	var FREE_SPOT = 'free_spot',
		USED_SPOT = 'used_spot',

		_chunks = [],
		objSize = MapTiles.objSize,
		that = this,
		map_data = {};

	/**
	 * Returns tile value for coord at x, y
	 *
	 * @param {Number} x
	 * @param {Number} y
	 * @return undefined if no data loaded (yet)
	 */
	this.get = function (x, y) {
		var chunk = WMap.toChunk(x, y);
		var chunkData = _chunks[chunk.chunk.x * WMap.getMapSize() + chunk.chunk.y];
		if (chunkData === undefined || chunkData.tiles === undefined || chunkData.loading === true) {
			return undefined;
		}
		if (chunkData.tiles[chunk.rel.y] === undefined) {
			return undefined; // Data is currently being loaded
		}
		return chunkData.tiles[chunk.rel.y][chunk.rel.x];
	};

	this.getChunk = function (x, y) {
		var chunkData = _chunks[x * WMap.getMapSize() + y];

		if (chunkData.loading === true) {
			return undefined;
		}

		return chunkData;
	};

	/**
	 * get a town from the data
	 *
	 * @param {Number} id Number
	 * @return Array with all found towns
	 */
	function getTowns(id) {
		if (typeof id === 'undefined') {
			return [];
		}

		var i = _chunks.length,
			j,
			town,
			towns,
			chunk,
			stack = [];

		while (i--) {
			if (!(chunk = _chunks[i])) {
				continue;
			}

			towns = chunk.towns;
			for (j in towns) {
				if (towns.hasOwnProperty(j)) {
					town = towns[j];
					if (town.id && town.id === id) {
						stack.push(town);
					}
				}
			}
		}
		return stack;
	}

	/**
	 * @param id String or Number
	 * @return Object or null
	 */
	this.getFarmTown = function (id) {
		var stack = getTowns(id),
		town;

		while ((town = stack.pop())) {
			if (town.relation_status || town.expansion_stage) {
				return town;
			}
		}

		return null;
	};

	/**
	 * @param id String or Number
	 * @return Object or null
	 */
	this.getTown = function (id) {
		var stack = getTowns(id),
			town;

		while ((town = stack.pop())) {
			// is this a game town or?
			// game towns have a property points, farm towns not
			if (typeof town.points !== 'undefined') {
				return town;
			}
		}

		return null;

	};

	/**
	 * Updates the lootable
	 */
	this.updateStatus = function (town_id, satisfaction, lootable_at, last_looted_at, lootable_human, relation_status, expansion_stage) {
		var stop_counter = 0;
		var il = _chunks.length;
		while (il--) {
			var chunkData = _chunks[il];

			if (typeof chunkData === 'undefined' || chunkData.loading === true) {
				continue;
			}
			var j;
			for (j in chunkData.towns) {
				if (chunkData.towns.hasOwnProperty(j)) {
					if (MapHelpers.getTownType(chunkData.towns[j]) === 'farm_town' && chunkData.towns[j].id === town_id) {
						//set popup to null - otherwise no new popup will be created
						chunkData.towns[j].popup = null;
						if (lootable_at > 0) {
							chunkData.towns[j].loot = lootable_at;
							chunkData.towns[j].lootable_human = DateHelper.timestampToLocaleTime(lootable_at);
							chunkData.towns[j].looted = last_looted_at;
						}
						if (typeof relation_status !== 'undefined' && chunkData.towns[j].relation_status !== relation_status) {
							chunkData.towns[j].relation_status = relation_status;
						}
						if (typeof expansion_stage !== 'undefined' && chunkData.towns[j].expansion_stage !== expansion_stage) {
							chunkData.towns[j].expansion_stage = expansion_stage;
						}
						if (typeof satisfaction !== 'undefined' && chunkData.towns[j].mood !== satisfaction && satisfaction > 0) {
							chunkData.towns[j].mood = Math.floor(satisfaction);
						}
						stop_counter++;
						if (stop_counter === 4) {
							return;
						}
					}
				}
			}
		}
	};

	/**
	 * @param towns Array with town id's
	 * @param color String in hex notation (F00342)
	 */
	this.updateColors = function (towns, color) {
		var len = towns.length;
		while (len--) {
			this.updateTownColorInAllChunks(towns[len], color);
		}
	};

    /**
     * Loops through all chunks till town id is found
     *
     * @param town_id
     * @param town_type_filter
     * @return Object
     */
	this.findTownInChunks = function (town_id, town_type_filter) {
		var i = _chunks.length, j,
			chunkData,
			town, towns, town_type;

		if (!town_type_filter) {
			town_type_filter = TOWN_TYPE.TOWN;
		}

		while (i--) {
			chunkData = _chunks[i];

			if (typeof chunkData === 'undefined' || chunkData.loading === true) {
				continue;
			}

			towns = chunkData.towns;

			for (j in towns) {
				if (towns.hasOwnProperty(j)) {
					town = towns[j];

					if (town.id === town_id) {
						// find island type for town
						if (town.islandType === undefined) {
							town.islandType = findIslandType(town.x, town.y, chunkData);
						}

                        town_type = MapHelpers.getTownType(town);

                        /*
                         	we need to check the town type here to make sure it is a valid town or farm town
                         	instead of a domination area marker or something else
						*/
						if (town_type === town_type_filter) {
							return town;
						}
					}
				}
			}
		}

		return null;
	};

	/**
	 * Loops through all chunks and changes the color of the town // because a town can be in more chunks
	 *
	 * @param town_id Number
	 * @param color String
	 */
	this.updateTownColorInAllChunks = function (town_id, color) {
		var i = _chunks.length, j,
			chunkData,
			town, towns;

		while (i--) {
			chunkData = _chunks[i];

			if (typeof chunkData === 'undefined' || chunkData.loading === true) {
				continue;
			}

			towns = chunkData.towns;

			for (j in towns) {
				if (towns.hasOwnProperty(j)) {
					town = towns[j];

					if (town.id === town_id) {
						// update color of town in chunk
						town.fc = color;
					}
				}
			}
		}
	};


	/**
	 * Collects the ids of all currently loaded ghost towns (towns without an owning player).
	 * Used to recolor ghost towns client-side, since their color is no longer delivered per town.
	 *
	 * @return Array
	 */
	this.getGhostTownIds = function () {
		let ids = [],
			i = _chunks.length, j,
			chunkData, towns, town;

		while (i--) {
			chunkData = _chunks[i];

			if (typeof chunkData === 'undefined' || chunkData.loading === true) {
				continue;
			}

			towns = chunkData.towns;

			for (j in towns) {
				if (towns.hasOwnProperty(j)) {
					town = towns[j];

					if (MapHelpers.isGhostTown(town) && ids.indexOf(town.id) === -1) {
						ids.push(town.id);
					}
				}
			}
		}

		return ids;
	};


	this.findIslandTypeInChunks = function (x, y) {
		var i = _chunks.length,
		chunkData,
		type;
		while (i--) {
			chunkData = _chunks[i];

			if (typeof chunkData === 'undefined' || chunkData.loading === true) {
				continue;
			}
			if ((type = findIslandType(x, y, chunkData))) {
				return type;
			}
		}
	};

	/**
	 * @return {Number} type of island for given coordinates
	 */
	function findIslandType(x, y, chunk) {
		var islands = chunk.islands,
			island,
			i = islands.length;

		while (i--) {
			island = islands[i];
			if (island.x === x && island.y === y) {
				return island.type;
			}
		}
		return false;
	}

	this.findIslandInfo = function (x, y) {
		var i = _chunks.length, j, chunkData;

		while (i--) {
			chunkData = _chunks[i];

			if (typeof chunkData === 'undefined' || chunkData.loading === true) {
				continue;
			}

			j = chunkData.islands.length;

			while (j--) {
				if (chunkData.islands[j].x === x && chunkData.islands[j].y === y) {
					return chunkData.islands[j];
				}
			}
		}
	};

	/**
	 * Getter to retrieve the map data. If createData has been called before, the returned result contains the data
	 * that has been created by that function.
	 * If you call getData, make sure to create the data for all types you need before, otherwise a ReferenceError will
	 * be thrown.
	 *
	 * @see WMap.createData
	 *
	 * @returns {Object}
	 */
	this.getData = function (types) {
		var i = types.length;

		while (i--) {
			if (!map_data.hasOwnProperty(types[i])) {
				throw new ReferenceError('The requested map data does not exist');
			}
		}

		return map_data;
	};

	/**
	 * Create the map data for the given area depending on the types (towns, island or wonders) that are given and store
	 * it in map_data.
	 * This is a replacement for all getSomethingFromPosForCurrentViewport()-functions.
	 *
	 * @param {Number} tileX Top coordinate
	 * @param {Number} tileY Left coordinate
	 * @param {Number} visibleTilesHorizontal Viewport width
	 * @param {Number} visibleTilesVertical Viewport height
	 * @param {Array} types Array of strings which contain the types the map data should created for (towns, island or wonders)
	 *
	 * @example
	 * WMap.mapData.createData(0, 0, 12, 6, ['towns', 'islands', 'wonders']);
	 * var data = WMap.getData(['towns', 'islands', 'wonders']);
	 */
	this.createData = function (tileX, tileY, visibleTilesHorizontal, visibleTilesVertical, types) {
		var chunks = this.getCoveredChunks(tileX, tileY, visibleTilesHorizontal, visibleTilesVertical),
			i = chunks.length,
			j,
			k,
			type,
			data,
			obj,
			chunk,
			pos,
			size,
			chunkData,
			result = {ownIslands: {}, islands: {}, towns: {}, wonders: []};

		// IMPORTANT!!! this will cause the islands to be handled before towns, WHICH IS A MUST
		// CAUTION!!! the loop itself is of the while(--i) kind and starts at the end
		// Island creation will set all places to FREE, whereas element creation sets them to USED
		types = types.sort().reverse();
		pos = MapHelpers.map2Pixel(tileX, tileY);
		size = MapHelpers.map2Pixel(visibleTilesHorizontal, visibleTilesVertical);

		while (i--) {
			chunk = chunks[i];

			chunkData = _chunks[chunk.x * WMap.getMapSize() + chunk.y];
			if (typeof chunkData === 'undefined' || chunkData.loading === true) {
				// must be queued ...
				continue;
			}

			j = types.length;
			while (j--) {
				type = types[j];
				result[type] = result[type] || [];
				data = chunkData[type];

				if (data instanceof Array) {
					k = data.length;
					while (k--) {
						obj = data[k];
						addToMapDataResult(obj, type, pos, size, result);
					}
				} else {
					for (k in data) {
						if (data.hasOwnProperty(k)) {
							obj = data[k];
							addToMapDataResult(obj, type, pos, size, result);
						}
					}
				}
			}
		}

		if (result.islands) {
			var island,
				islandYs,
				islandId,
				islandWithInvSpots,
				neighbourXy;

			for (islandId in result.islands) {
				if (result.islands.hasOwnProperty(islandId)) {
                    // For each island in the result list...
					island = result.islands[islandId];

					// get the neighbours for the islands which belong to us
					islandYs = result.ownIslands[island.x];
					if (islandYs && islandYs.indexOf(island.y) !== -1 && island.neighbours) {
						i = island.neighbours.length;
                        // For each neighbour of the current island...
						while (--i >= -1) {
							if (i === -1) {
								neighbourXy = makeDWord(island.y, island.x);
								islandWithInvSpots = island;
							} else {
								neighbourXy = parseInt(island.neighbours[i], 10);
								islandWithInvSpots = result.islands[neighbourXy];
							}

                            // If that island is inhabitable -- and does not have a world wonder
							if (islandWithInvSpots && isInhabitableIsland(islandWithInvSpots) && !islandHasWonder(islandWithInvSpots.x, islandWithInvSpots.y, result.wonders)) {
								// create invition spots for all free places on this island
								var placeOnIsland = islandWithInvSpots.towns.length,
									invitationSpot,
									townOffset,
									town;
                                // For each place on that neighbour island...
								while (
									Game.is_registration_possible && Game.features.friend_invites && placeOnIsland--
								) {
                                    // Get the element from the current place
                                    // It can occur that result.towns contain a different set of data which leads to different types of
                                    // invitation spots...
									town = result.towns[neighbourXy + '_' + placeOnIsland];
									townOffset = MapTiles.islands[islandWithInvSpots.type].town_offsets[placeOnIsland];
									if (islandWithInvSpots.towns[placeOnIsland] === FREE_SPOT && !town) {
										invitationSpot = {
											dir: townOffset.dir,
											id: islandWithInvSpots.x + '_' + islandWithInvSpots.y + '-' + placeOnIsland,
											nr: placeOnIsland,
											ox: townOffset.x,
											oy: townOffset.y,
											type: 'inv_spo',
											x: islandWithInvSpots.x,
											y: islandWithInvSpots.y,
											player_town_id: Game.townId
										};
										result.towns[neighbourXy + '_' + placeOnIsland] = invitationSpot;
									} else if (islandWithInvSpots.towns[placeOnIsland] !== FREE_SPOT && town && !town.name) {
										var colonized_town = MapHelpers.getColonizedTown(town);

										// add the invitation feature to the colo flags if there is no ongoing colonization
										town.invitation_spot = (colonized_town == false);
										town.player_town_id = Game.townId;
										town.dir = townOffset.dir;
										town.fx = townOffset.fx;
										town.fy = townOffset.fy;
									}
								}
							}
						}
					}
				}
			}
		}

		// Store the creation result. It is accessible via getData()
		map_data = result;
	};

    function islandHasWonder(island_x, island_y, wonders) {
        for (var i = 0; i < wonders.length; i++) {
            if (wonders[i] && wonders[i].ix == island_x && wonders[i].iy == island_y && wonders[i].wt != 'wbg') {
                return true;
            }
        }
        return false;
    }

	function isInhabitableIsland(island) {
		if (island && island.towns && island.towns.length) {
			return island.towns.length >= 20;
		}
		return false;
	}

	function addToMapDataResult(obj, type, pos, size, result) {
		var islandXy = makeDWord(parseInt(obj.y, 10), parseInt(obj.x, 10)),
			island,
			position,
			numberOnIsland;

		if (!shouldBeVisible(pos.x, pos.y, size.x, size.y, obj, type)) {
			if (type === 'towns' && obj.type === 'free') {
                island = result.islands[islandXy];
                if (island) {
                    island.towns[obj.nr] = USED_SPOT;
                }
			}
			return;
		}

		if (type === 'towns') {
			// collect islands, where the player has towns
			if (obj.player_name === Game.player_name) {
				// town of the logged in player
				if (!result.ownIslands[obj.x]) {
					result.ownIslands[obj.x] = [obj.y];
				}
			}

			// delete the freespots from islands. Remember this only works while the islands are
			// generated before the towns, which is why we did the sort at the beginning
			island = result.islands[islandXy];
			if (island) {
				island.towns[obj.nr] = USED_SPOT;
			}

			// insert the towns into the result
			position = obj.nr === undefined ? makeDWord(obj.oy, obj.ox) : obj.nr;

			result.towns[islandXy + '_' + position] = obj;
		} else if (type === 'islands') {
			// we will save islands under their ID, not just in an array
			if (!result.islands[islandXy]) {
				obj.towns = [];
				numberOnIsland = MapTiles.islands[obj.type].town_offsets.length;
				while (numberOnIsland--) {
					obj.towns[numberOnIsland] = FREE_SPOT;
				}
				result.islands[islandXy] = obj;
			}
		} else {
			// all other types of data will only be added to the result
			result[type].push(obj);
		}
	}

	/**
	 * Checks if an object should be visible or not.
	 *
	 * @param {Number} x
	 * @param {Number} y
	 * @param {Number} w
	 * @param {Number} h
	 * @param {Object} obj
	 * @param {String} type
	 *
	 * @return {Boolean}
	 */
	function shouldBeVisible(x, y, w, h, obj, type) {
		var x2   = obj.x === undefined ? obj.ix : obj.x,
			y2   = obj.y === undefined ? obj.iy : obj.y,
			size = objSize[type] || objSize[obj.type] || {'x': 0, 'y': 0},
			tmp;

		tmp = MapHelpers.map2Pixel(x2, y2);
		// add pixel offset. or 0.
		tmp.x += obj.ox || 0;
		tmp.y += obj.oy || 0;

		return tmp.x.between(x - size.x, x + w) && tmp.y.between(y - size.y, y + h);
	}

	/**
	 * Write multiple chunks to the cache in case they are newer
	 *
	 * @param mapdata the data as sent from the server {night:bool, data:[chunks]}
	 * @returns {number} number of replaced chunks
	 */
	this.setData = function (mapdata) {
		var chunks_replaced = 0,
			chunk,
			key,
			data = mapdata.data,
			x, y,
			il = data.length;

		if (mapdata.night !== undefined && mapdata.night !== Game.night_mode) {
			Game.night_mode = mapdata.night;

			$.Observer(GameEvents.game.night).publish({
				enabled : mapdata.night
			});
		}

		while (il--) {
			chunk = data[il];
			chunk.loading = false;
			x = parseInt(chunk.chunk.x, 10);
			y = parseInt(chunk.chunk.y, 10);
			key = x * WMap.getMapSize() + y;

			if (!_chunks[key]) {
				_chunks[key] = chunk;
			} else if (chunk.chunk.timestamp > _chunks[key].chunk.timestamp) {
				_chunks[key] = chunk;
				chunks_replaced++;
			}
		}

		return chunks_replaced;
	};

	this._loadData = function (chunks, success_handler) {

		var params = {
				chunks : chunks
			},
			handleChunkData = function (data, flag) {
				var chunks_replaced = this.setData(data);
				if (success_handler) {
                    success_handler.call(this, chunks_replaced);
				}

				if (chunks_replaced !== undefined && chunks_replaced > 0) {
					// recreate map
					WMap.refresh();
				}
			}.bind(this);

		WMap.ajaxloader.ajaxGet('map_data', 'get_chunks', params, true, handleChunkData);
	};

	/**
	 * Load data from server and update map with requested data.
	 * There is a rate limit on this function, so it will only be called once within 100ms if the same data is requested.
	 * So if it's called repeatedly for the same chunks within 100ms, only the last call will be executed.
	 *
	 * @param {Array} chunks [{x:number, y:number}]
	 * @param {Function} success_handler function to be called when new data arrived
	 */
	this.loadData = (function() {
		var throttledLoadData = us.debounce(this._loadData.bind(this), 100),
			originalLoadData = this._loadData.bind(this),
			last_chunks = {};

		return function(chunks, success_handler) {
			// if the same data is requested again, use throttled loading
			var loadData = us.isEqual(last_chunks, chunks) ? throttledLoadData : originalLoadData;
			last_chunks = chunks;
			return loadData(chunks, success_handler);
		};
	}.bind(this))();

	/**
	 * Check which chunks are covered by the given rectangle.
	 *
	 * Since we can't draw islands based on the chunk.tiles (see also GP-3869), we have to use the
	 * chunk.islands for this:
	 * island coordinates are based on their top left corner, so it will happen that islands which
	 * should be visible in the current viewport are actually located on another chunk (the one
	 * top or left of the current one).
	 * So if the viewport is close to a chunk border, the coordinates for the previous chunk are
	 * also returned.
	 *
	 */
	this.getCoveredChunkRectangle = function (x, y, width, height) {
		var chunk_size = WMap.getChunkSize();

		var m = Math,
			lower = 0.5,
			x2 = x / chunk_size,
			y2 = y / chunk_size;

		return {
			minX: m.floor(m.max((x2 % 1) > lower ? x2 : x2 - 1, 0)),
			minY: m.floor(m.max((y2 % 1) > lower ? y2 : y2 - 1, 0)),
			maxX: m.min(m.floor((x + width) / chunk_size), MapTiles.mapSize / chunk_size - 1),
			maxY: m.min(m.floor((y + height) / chunk_size), MapTiles.mapSize / chunk_size - 1)
		};
	};

	/**
	 * Check which chunks are covered by the given rectangle.
	 */
	this.getCoveredChunks = function (x, y, width, height) {
		var rect = this.getCoveredChunkRectangle(x, y, width, height),
			chunks = [];
		for (y = rect.minY; y <= rect.maxY; y++) {
			for (x = rect.minX; x <= rect.maxX; x++) {
				chunks.push({
					x: x,
					y: y
				});
			}
		}
		return chunks;
	};

	/**
	 * Checks if data in the rectangle x,y,width,height has to be reloaded
	 * The function checks for every chunk if there data has to be reloaded.
	 */
	this.checkReload = function (x, y, width, height, success_handler, reload_required) {
		// Get chunk coordinates
		var chunks = this.getCoveredChunks(x, y, width, height),
			// Check chunks
			reload = [],
			il = chunks.length,
			pos,
			chunkData;

		while (il--) {
			pos = chunks[il];
			chunkData = _chunks[pos.x * WMap.getMapSize() + pos.y];

			if (chunkData === undefined || reload_required) {
				_chunks[pos.x * WMap.getMapSize() + pos.y] = {loading: true, chunk: {timestamp: 0}};
				reload.push({
					x: pos.x,
					y: pos.y,
					timestamp: _chunks[pos.x * WMap.getMapSize() + pos.y].chunk.timestamp
				});
			}
		}

		if (reload.length) {
			this.loadData(reload, success_handler);
		} else if (success_handler) {
			success_handler();
		}
	};

	/**
	 * Checks if visible chunks are outdated and server has newer chunk data
	 */
	this.checkCache = function (x, y, width, height, success_handler) {
		// Get chunk coordinates
		var chunks = this.getCoveredChunks(x, y, width, height),
			// Check chunks
			reload = [],
			il = chunks.length,
			pos,
			chunkData;

		while (il--) {
			pos = chunks[il];
			chunkData = _chunks[pos.x * WMap.getMapSize() + pos.y];

			if (typeof chunkData === 'undefined' || chunkData.loading === false) {
				reload.push({
					x: pos.x,
					y: pos.y,
					timestamp: chunkData ? chunkData.chunk.timestamp : 0
				});
			}
		}

		if (reload.length) {
			this.loadData(reload, success_handler);
		} else if (success_handler) {
			success_handler.call();
		}
	};

	/**
	 * clears the complete _chunks cache and therefore all data gets reloaded from the
	 * server.
	 */
	this.clearCache = function() {
		_chunks = [];
	};

	that.setData(data);
};
