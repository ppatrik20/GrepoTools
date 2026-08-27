/* global Game, GameEvents, MM, _, us, WMap, GameData, DM, Minimap, HelperBrowserEvents, JSON */

/*
 * This modules has all the code to deal with mouse events on the map, click, popups (tooltips), moving etc
 */

define('map/mixins/mouse_handlers', function () {
    'use strict';

    var MousePopup = window.MousePopup;
    var MapHelpers = require('map/helpers');
    var TOWN_TYPES = require('enums/town_types');
    var GPWindowMgr = window.GPWindowMgr;
    var WndHandlerInviteFriends = window.WndHandlerInviteFriends;
    var Features = require('data/features');
    var DateHelper = require('helpers/date');
    var Timestamp = require('misc/timestamp');
    var AttackSpotFactory = require('features/attack_spots/factories/attack_spot');
    var MovementTooltipHelper = require('helpers/movement_tooltip_helper');
    var CityGroupTooltipHelper = require('helpers/city_group_tooltip_helper');
    var UnitsTooltipHelper = require('helpers/units_tooltip_helper');
    var AttackPointRangeTooltipHelper = require('helpers/attack_point_range_tooltip_helper');
    var LayoutModes = require('enums/layout_modes');
    var TooltipFactory = require('factories/tooltip_factory');
    var OlympusHelper = require('helpers/olympus');

    var EVENT_NAMESPACE = 'map';

    var down_name = HelperBrowserEvents.getOnStartEventName(EVENT_NAMESPACE);
    var up_name = HelperBrowserEvents.getOnStopEventName(EVENT_NAMESPACE);
    var move_name = HelperBrowserEvents.getOnMoveEventName(EVENT_NAMESPACE);
    var leave_name = HelperBrowserEvents.getOnLeaveEventName(EVENT_NAMESPACE);

    return {
        mousePopup: new MousePopup(),

        initializeMouseEvents: function () {
            var $document = $(document);

            // the "up" handler will be processed from anywhere in the document to stop map scrolling no matter where you release the mouse
            $document.off(up_name).on(up_name, this.handlerUp.bind(this));
            // the "down" handler will only start to work from #map_wrapper
            this.elm.wrapper.off(down_name).on(down_name, this.handlerDown.bind(this));
            if (!Game.isMobileBrowser()) {
                this.elm.wrapper.off(move_name).on(move_name, this.delegateMouseOver.bind(this));
            }
            $(window).on("resize", this.handlerResize.bind(this));
        },

        /**
         * Callback for mousedown events.
         *
         * Save the target of the mousedown for further inspection in the mouseup
         * Mousedown events initialize a mapmove
         * They hide and disable popups
         */
        handlerDown: function (event) {
            if (this.currently_scrolling) {
                return true;
            }

            var target = event.target,
                $target = $(target),
                $document = $(document);

            // link detection
            // this filters out everything that is not a 'a' tag link,
            // so that clicks on divs etc. are always considered moves while clicks
            // on 'a' are further inspected for mouseUp / mouseMove
            if (target) {
                if (target.tagName.toLowerCase() === 'a') {
                    event.preventDefault();
                    this.mouseDownTarget = target;
                }

                // newer code implements DIV as a clickable element
                if ($target.data('type') === 'attack_spot') {
                    this.mouseDownTarget = target;
                }
            }

            this.currently_scrolling = true;

            this.last_move_x = this.last_move_y = 0;

            // when mouse is pressed, unbind the MousePopup Handling
            // and bind the map move handling to 'mousemove'
            // mousemove is registered on $document to allow moving the map with
            // while mousedown even when hovering other UI elements (like it is on the minimap
            // and city overview)
            $document.off(move_name).on(move_name, this.handlerMove.bind(this));

            // Disable and hide popups during mousedown
            this.elm.coord_popup.hide();
            this.mousePopup.disable();
            this.mousePopup.handlerOut();

            this.mousemove(event);

            return true;
        },

        /**
         * Callback for mouseup events.
         *
         * @param {Event} e object
         *
         */
        handlerUp: function (event) {
            var target = event.target,
                $document = $(document);

            if (event.type === "touchend") {
                var x = event.originalEvent.changedTouches[0].pageX - window.pageXOffset;
                var y = event.originalEvent.changedTouches[0].pageY - window.pageYOffset;
                target = document.elementFromPoint(x, y);
            }

            this.currently_scrolling = false;

            if (target && target === this.mouseDownTarget) {
                this.delegateClick(event);
            } else if (Game.layout_mode === LayoutModes.STRATEGIC_MAP &&
                this.elm.wrapper.find(target).length > 0) {
                Minimap.delegateClick(event);
            }

            // hide popup on mouseup and mouseleave
            this.elm.wrapper.off(leave_name).on(leave_name, this.mousePopup.handlerOut.bind(this.mousePopup));
            this.mousePopup.handlerOut();

            // unregister moving the map, and re-register tooltips
            $document.off(move_name);

            if (!Game.isMobileBrowser()) {
                this.elm.wrapper.off(move_name).on(move_name, this.delegateMouseOver.bind(this));
            }

            this.mouseDownTarget = null;

            return true;
        },

        /**
         * Callback for mousemove events
         *
         * @param {Event} e Event object
         */
        handlerMove: function (e) {
            this.mousemove(e);
            return true;
        },
        /**
         * Callback for resize events
         *
         * @param {Event} e Event object
         */
        handlerResize: function () {
            if (!this.initialized) {
                return;
            }

            // call resize not every time the event is triggered
            window.clearTimeout(this.resizeTimeout);
            this.resizeTimeout = window.setTimeout(function () {
                this.resize();
            }.bind(this), 300);

        },

        /**
         * Move map by given amount of pixel
         *
         * @param {Event} event {clientX, clientY} scroll in pixel
         * @param {Boolean} reset_last_move
         */
        mousemove: function (event, reset_last_move) {
            if (!this.initialized) {
                return;
            }

            event = event.originalEvent || event;

            var map,
                diff,
                scroll = this.scroll;

            if (this.last_move_x === 0 && this.last_move_y === 0 && (reset_last_move === undefined || reset_last_move === true)) {
                if (event.touches) {
                    this.last_move_x = event.touches[0].pageX;
                    this.last_move_y = event.touches[0].pageY;
                } else {
                    this.last_move_x = event.clientX;
                    this.last_move_y = event.clientY;
                }
            }

            if (event.touches) {
                if (!Game.isHybridApp()) {
                    event.preventDefault();
                }
                // Distance to last move
                diff = {
                    'x': event.touches[0].pageX - this.last_move_x,
                    'y': event.touches[0].pageY - this.last_move_y
                };
            } else {
                // Distance to last move
                diff = {
                    'x': event.clientX - this.last_move_x,
                    'y': event.clientY - this.last_move_y
                };
            }

            this.last_move_x += diff.x;
            this.last_move_y += diff.y;

            if (!Game.isMobileBrowser()) {
                // do not use 'faster then the finger' map movement on touch devices
                diff = {
                    x: diff.x * Game.map_scroll_acceleration,
                    y: diff.y * Game.map_scroll_acceleration
                };
            }

            if (Game.layout_mode === LayoutModes.ISLAND_VIEW) {
                this.setScroll(scroll.x - diff.x, scroll.y - diff.y);
            } else if (Game.layout_mode === LayoutModes.STRATEGIC_MAP) {
                Minimap.scrollMapBy(diff);
                Minimap.setLastMousePos(this.last_move_x, this.last_move_y);
            }

            //real value
            map = MapHelpers.pixel2Map(scroll.x, scroll.y);

            this.mapX = map.x;
            this.mapY = map.y;
        },

        mapMoveFrame: function () {
            var x = this.scroll.x,
                y = this.scroll.y;

            if (this.last_scroll_x !== x || this.last_scroll_y !== y) {
                this.last_scroll_x = x;
                this.last_scroll_y = y;

                // change value of input fields to current coordinates
                this.updateMapCoordInfo();

                //if viewport has changed
                if (this.movesColumnsAndRows()) {
                    WMap.refresh('town');
                }

                this.setMoveContainerPos(-x, -y);
            }

            // endlessly try to update the map position. Increases base CPU load but increases
            // reactiontime on the map
            return true;
        },

        /**
         * @param {Event} event
         */
        delegateClick: function (event) {
            // chop off base64-encoded part, decode and evaluate:
            var town, island, chunkTown,
                target = this.mouseDownTarget;

            var base64 = target.href ? target.href.split(/#/).reverse()[0] : '',
                decoded = atob(base64),
                data = decoded !== '' ? JSON.parse(decoded) : '';

            // if the href / base64 / atob stuff resulted in something useful, use it here
            // in some cases data is undefined, like a klick on opened present, that has no href attribute
            /*
             * the legacy way to deal with mouse clicks is to evaluate the data from the base64 encoded url, however
             * the BattlePointVillages intrododuce models/ collections so we need only an id
             */
            if (data) {
                switch (data.tp) {
                    case TOWN_TYPES.FREE:
                        var ongoing_colonizations_count = MapHelpers.getOnGoingColonizationsCount(),
                            colonized_town = false;
                        if (ongoing_colonizations_count > 0) {
                            colonized_town = MapHelpers.getColonizedTown(data);
                        }

                        if (data.inv_spo) {
                            if (!GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_INVITE_FRIENDS)) {
                                window.Layout.contextMenu(event, 'invite_to_colo_flag', data);
                            } else {
                                WndHandlerInviteFriends.selectSpotOnMap(data);
                            }
                            Game.invitation_path = {
                                src: 'map'
                            };
                        } else if (colonized_town) {
                            window.ColonizationCommandWindowFactory.openColonizationCommandWindow(_('City foundation'), colonized_town.getId());
                        } else {
                            require('features/colonization/factories/colonization_window').openWindow({
                                'target_x': data.ix,
                                'target_y': data.iy,
                                'target_number_on_island': data.nr
                            });
                        }
                        $.Observer(GameEvents.map.free_town.click).publish();
                        break;
                    case TOWN_TYPES.INV_SPO:
                        WndHandlerInviteFriends.selectSpotOnMap(data);
                        $.Observer(GameEvents.map.invitation_spot.click).publish();
                        break;
                    case TOWN_TYPES.TOWN:
                        chunkTown = this.mapData.getTown(data.id);
                        data.name = chunkTown.name;

                        // check for ghost town
                        if (MapHelpers.isGhostTown(chunkTown)) {
                            window.Layout.contextMenu(event, 'ghost_town', data);
                        } else {
                            window.Layout.contextMenu(event, 'determine', data);
                        }

                        $.Observer(GameEvents.map.town.click).publish(chunkTown);
                        break;
                    case TOWN_TYPES.FARM_TOWN:
                        island = this.mapData.findTownInChunks(Game.townId);
                        town = this.mapData.getFarmTown(data.id);
                        if (data.ix === island.x && data.iy === island.y) {
                            if (town.relation_status === 0) {
                                GPWindowMgr.Create(GPWindowMgr.TYPE_FARM_TOWN, _('Attack on') + ' ' + town.name, {
                                    'action': 'attack'
                                }, town.id);
                            } else {
                                window.Layout.contextMenu(event, 'farm_town', town);
                            }
                        }
                        $.Observer(GameEvents.map.farm.click).publish({
                            relation_status: town.relation_status,
                            mood: town.mood
                        });
                        break;
                    case 'wonder':
                        // name is stored in title tag or in mouseover
                        GPWindowMgr.Create(GPWindowMgr.TYPE_WONDERS, target.title || this.mousePopup.titleTag || '', {}, data.ix, data.iy);
                        break;
                    case 'island':
                        GPWindowMgr.Create(GPWindowMgr.TYPE_ISLAND, '', {}, data);
                        $.Observer(GameEvents.map.island.click).publish();
                        break;
                    case TOWN_TYPES.SPECIAL_TOWN:
                        chunkTown = this.mapData.getTown(data.id);
                        if (chunkTown && chunkTown.island_quest_data) {
                            this.openIslandQuestInQuestLog(chunkTown);
                        }
                        break;
                    case 'temple':
                        window.Layout.contextMenu(event, 'temple', data);
                        break;
                }
            } else if (Features.battlepointVillagesEnabled()) {
                var $target = $(target),
                    type = $target.data('type'),
                    id = $target.data('id');

                switch (type) {
                    case TOWN_TYPES.FARM_TOWN:
                        this.checkAndOpenFarmTownWindow(id);
                        break;
                    case TOWN_TYPES.ATTACK_SPOT:
                        this.openAttackSpotWindow(id);
                        break;

                    default:
                        break;
                }
            }
        },

        /**
         *
         * @param chunkTown
         */
        openIslandQuestInQuestLog: function(chunkTown) {
            $.Observer(GameEvents.map.special_town.click).publish(chunkTown);
            var decision_ids = chunkTown.island_quest_data.progressables_id;
            if (decision_ids.length > 1) {
                var active_decision,
                    window_open = false;

                decision_ids.forEach(function(decision_id) {
                    active_decision = MM.getCollections().IslandQuest[0].get(decision_id);
                    if (!window_open && active_decision) {
                        this.openQuestLog(parseInt(active_decision.getId(), 10));
                        window_open = true;
                    }
                }.bind(this));
            } else {
                this.openQuestLog(parseInt(decision_ids, 10));
            }
        },

        /**
         * open a farm town window
         */
        checkAndOpenFarmTownWindow: function (id) {
            $.Observer(GameEvents.map.farm.click).publish({});
            window.FarmTownWindowFactory.openWindow(id);
        },

        /**
         * @param {Event} event
         */
        delegateMouseOver: function (event) {
            var target = event.target,
                town, data, popup, title, base64;

            if (this.mapArrow) {
                if (Game.layout_mode === LayoutModes.ISLAND_VIEW) {
                    this.mapArrow.move(event, this.mapPosition, this.townPosition);
                } else if (Game.layout_mode === LayoutModes.STRATEGIC_MAP) {
                    this.mapArrow.move(
                        event,
                        Minimap.getMinimapPosition(),
                        Minimap.convertPositionToMinimapPosition(this.townPosition),
                        Minimap.getScale()
                    );
                }
            }

            if (this.currently_scrolling) {
                return;
            }

            if (!target.href) {
                // restore title
                if (this.mousePopup.titleTag) {
                    this.mouseOverTarget.title = this.mousePopup.titleTag;
                    delete this.mousePopup.titleTag;
                }

                this.mouseOverTarget = null;
                if (this.mousePopup.enabled) {
                    this.mousePopup.handlerOut();
                }
                this.mousePopup.disable();
                return;
            }

            // create mouseover
            if (this.mouseOverTarget !== target) {
                this.mousePopup.initialize();
                this.mouseOverTarget = target;

                base64 = atob(target.href.split(/#/).reverse()[0]);

                data = base64 !== '' ? JSON.parse(base64) : '';

                /*
                 * the legacy way to deal with mousePopups is to evaulate the bas64 data from the link, however
                 * the BattlePointVillages introduce collection / models for this, so only ID is evaluated
                 */
                if (data) {
                    switch (data.tp) {
                        case 'island':
                            return;
                        case TOWN_TYPES.TOWN:
                            town = this.mapData.getTown(data.id);
                            break;
                        case TOWN_TYPES.SPECIAL_TOWN:
                            town = this.mapData.getTown(data.id);
                            break;
                        case TOWN_TYPES.GHOST_TOWN:
                            town = this.mapData.getTown(data.id);
                            break;
                        case TOWN_TYPES.FARM_TOWN:
                            town = this.mapData.getFarmTown(data.id);
                            break;
                        default:
                            break;
                    }

                    // save title
                    title = target.title;

                    this.mousePopup.titleTag = title;

                    target.title = '';

                    popup = title || this.createTownTooltip(data.tp, town || data);

                    if (popup) {
                        this.mousePopup.enable();
                    } else {
                        this.mousePopup.disable();
                    }

                    this.mousePopup.xhtml = popup;
                    this.mousePopup.showDiv();
                } else if (Features.battlepointVillagesEnabled()) {
                    var $target = $(event.target),
                        type = $target.data('type'),
                        id = $target.data('id');

                    switch (type) {
                        case TOWN_TYPES.FARM_TOWN:
                            popup = this.createBPVFarmTownTooltip(id);
                            break;

                        default:
                            break;
                    }

                    if (popup) {
                        this.mousePopup.enable();
                    } else {
                        this.mousePopup.disable();
                    }

                    this.mousePopup.xhtml = popup;
                    this.mousePopup.showDiv();
                }
            }

            this.mousePopup.handlerMove(event);
        },

        /**
         *  creates a html popup for given town
         *
         *  @param {String} town_type
         *  @param {Object} town_or_invitation_data
         */
        createTownTooltip: function (town_type, town_or_invitation_data) {
            var town_or_invitation_spot = town_or_invitation_data;
            if (!this.initialized) {
                return '';
            }

            if (town_type === TOWN_TYPES.FREE) {
                if (town_or_invitation_data.inv_spo) {
                    town_or_invitation_spot = town_or_invitation_data.inv_spo;
                } else {
                    town_or_invitation_spot = false;
                }
            }

            var html = '';
            var WMap = this;
            var l10n = DM.getl10n('map');
            var rendered_tooltip;
            var ongoing_colonizations_count = MapHelpers.getOnGoingColonizationsCount();

            function specialTown(town) {
                if (town.island_quest_data) {
                    html = l10n.view_quest_details;
                } else {
                    html = '';
                }
            }

            function getReservationStatus(town) {
                if (!town.reservation) {
                    return '';
                }

                if (town.reservation.state === 'added') {
                    if (town.reservation.type === 'ally') {
                        return l10n.can_reserve;
                    } else { // pact
                        return l10n.reserved_by_alliance;
                    }

                } else if (town.reservation.state === 'reserved') {
                    if (town.reservation.type === 'own') {
                        return l10n.reserved_for_you;
                    } else if (town.reservation.type === 'ally') {
                        return l10n.reserved_for(town.reservation.player_link);
                    } else {
                        return l10n.reserved_for_alliance(town.reservation.player_link, town.reservation.alliance_link);
                    }
                }
            }

            // creates the normal town mouseover
            function normalTown(town) {
                var reservation_status = getReservationStatus(town),
                    tooltip_html,
                    has_protection = town.protection_end && town.protection_end > Timestamp.now(),
                    protection_end = has_protection ? l10n.town_protection_end + ' ' + DateHelper.formatDateTimeNice(town.protection_end, true, false) : null,
                    in_attack_point_range = false;

                if (Features.isCasualWorld() &&
                    MM.getModels().PlayerSettings[Game.player_id].isPlayerInAttackablePointRangeTooltipEnabled() &&
                    !has_protection)
                {
                    in_attack_point_range = AttackPointRangeTooltipHelper.getAttackPointRange(town);
                }

                rendered_tooltip = us.template(DM.getTemplate('map', 'normal_town_tooltip')) ({
                    l10n: l10n,
                    town: town,
                    protection_end: protection_end,
                    in_attack_point_range: in_attack_point_range,
                    ghost_town_label: DM.getl10n('common').ghost_town,
                    is_ghost_town: MapHelpers.isGhostTown(town),
                    //@TODO remove image path
                    image_path: Game.img(),
                    reservation_status: reservation_status,
                    city_groups: CityGroupTooltipHelper.getCityGroupTooltipData(town)
                });

				var banner = GameData.world_masters_banners[town.player_id],
					$has_won_world_masters = $('.has_won_world_masters');

				$has_won_world_masters.empty();

				if (typeof banner !== 'undefined') {
					$has_won_world_masters.append(
						us.template(DM.getTemplate('map', 'world_masters'))({
							end_game: banner.banner_endgame.replace('end_game_type_', ''),
							win_date: banner.win_date,
							artifact: banner.artifact,
							level: banner.level
						})
					);
				}

                tooltip_html = $(rendered_tooltip);
                tooltip_html.find('.town_infos .town_tooltip_table').append(MovementTooltipHelper.createMovementTooltipData(town));
                if (MM.getModels().PlayerSettings[Game.player_id].isShowUnitsInTownTooltipEnabled()) {
                    tooltip_html.find('.town_infos').append(UnitsTooltipHelper.createHtmlListElementsForUnitsInTown(town.id));
                }

                html = tooltip_html;
            }

            // creates a farm town mouseover
            function farmTown(town) {
                var relation_collection = MM.getOnlyCollectionByName('FarmTownPlayerRelation'),
                    relation = relation_collection.getRelationForFarmTown(town.id);

                if (town.x === WMap.islandPosition.x && town.y === WMap.islandPosition.y) {
                    switch (town.relation_status) {
                        case -1:
                            town.player_relation_message = l10n.not_in_your_possession;
							break;
                        case 0:
                            town.player_relation_message = l10n.tooltips.not_conquered;
                            break;
                        case 1:
                            town.player_relation_message = l10n.tooltips.in_your_possession;
                            break;
                        case 2:
                            town.player_relation_message = l10n.tooltips.revolt;
                            break;
                        default:
                            town.player_relation_message = '';
                            break;
                    }

                    if (!town.loot) {
                        town.loot = null;
                    }

                    town.ratio = relation.getCurrentTradeRatio();

                    html = us.template(GameData.FarmMouseOverTemplate) (town);
                } else {
                    //don't show a mouse popup for farm towns on other islands
                    html = null;
                }
            }

            function wonderPopup() {
                html = l10n.tooltips.wonder_popup;
            }

            function foundTown() {
                html = l10n.tooltips.found_town;
            }

            function inviteFriend() {
                html = l10n.tooltips.invite_friend;
            }

            function foundTownOrInviteFriend() {
                html = l10n.tooltips.found_or_invite;
            }

            function colonizeTown(time) {
                html = l10n.tooltip_colonization(time);
            }

            function foundColonizedTown(time) {
                html = l10n.tooltip_foundation(time);
            }

            function dominationAreaMarker() {
                var tooltip = l10n.tooltips.domination_area_marker;

                html = '<b>' + tooltip.headline + '</b><br /><br />' + tooltip.text;
            }

            function olympusTemple(data) {
                var temple = OlympusHelper.getTempleByIslandXAndIslandY(data.ix, data.iy);

                html = TooltipFactory.getOlympusTempleTooltip(temple);
            }

            /*
             * create tooltip / popup
             */
            switch (town_type) {
                case TOWN_TYPES.TOWN:
                    normalTown(town_or_invitation_spot);
                    break;
                case TOWN_TYPES.FARM_TOWN:
                    farmTown(town_or_invitation_spot);
                    break;
                case 'wonder':
                    wonderPopup();
                    break;
                case TOWN_TYPES.INV_SPO:
                    inviteFriend();
                    break;
                case TOWN_TYPES.FREE:
                    var colonized_town = false;
                    if (ongoing_colonizations_count > 0) {
                        colonized_town = MapHelpers.getColonizedTown(town_or_invitation_data);
                    }

                    if (colonized_town) {
                        if (colonized_town.hasFoundationStarted()) {

                            var foundation_time = DateHelper.readableSeconds(colonized_town.getColonizationFinishedAt() - Timestamp.now());
                            foundColonizedTown(foundation_time);
                        } else {

                            var colonization_time = DateHelper.readableSeconds(colonized_town.getArrivalAt() - Timestamp.now());
                            colonizeTown(colonization_time);
                        }
                    }
                    else if (town_or_invitation_spot) {
                        foundTownOrInviteFriend();
                    } else {
                        foundTown();
                    }
                    break;
                case TOWN_TYPES.SPECIAL_TOWN:
                    specialTown(town_or_invitation_spot);
                    break;
                case TOWN_TYPES.DOMINATION_AREA_MARKER:
                    dominationAreaMarker();
                    break;
                case 'temple':
                    olympusTemple(town_or_invitation_spot);
                    break;
                default:
                    foundTown();
            }

            return html;
        },

        /*
         * create the tooltip for a farm town
         */
        createBPVFarmTownTooltip: function (town_id) {
            var relation_collection = MM.getOnlyCollectionByName('FarmTownPlayerRelation'),
                relation = relation_collection.getRelationForFarmTown(town_id),
                farm_town_collection = MM.getOnlyCollectionByName('FarmTown'),
                farm_town = farm_town_collection.get(town_id),
                l10n = DM.getl10n('farm_town');

            // we do not see tooltips for farm town on islands where we have no town
            if (!relation) {
                return;
            }

            var ratio = relation.getCurrentTradeRatio(),
                upgrade_time = relation.getExpansionAt() - Timestamp.now(),
                next_claim_time = relation.getLootableAt() - Timestamp.now(),
                spinner = (relation.isUpgradeRunning() && upgrade_time < 0) || (!relation.isLootable() && next_claim_time < 0),
                formatted_upgrade_time = DateHelper.readableSeconds(upgrade_time < 0 ? 0 : upgrade_time),
                formatted_next_claim_time = DateHelper.readableSeconds(next_claim_time < 0 ? 0 : next_claim_time);

            return us.template(DM.getTemplate('map', 'bpv_farmtown_tooltip')) ({
                town_name: farm_town.getName(),
                town_id: town_id,
                resources: {
                    offer: farm_town.getResourceOffer(),
                    demand: farm_town.getResourceDemand(),
                    ratio: '1:' + ratio
                },
                relation: relation,
                l10n: l10n,
                spinner: spinner,
                upgrade_time: formatted_upgrade_time,
                next_claim_time: formatted_next_claim_time
            });
        },

        openAttackSpotWindow: function () {
            AttackSpotFactory.openWindow();
        },

        openQuestLog: function (quest_id) {
            var QuestLogFactory = require('features/questlog/factories/questlog');
            var Quests = require('enums/quests');

            QuestLogFactory.openWindow(quest_id, Quests.ISLAND_QUEST);
        },

        /**
         * in BPV we want to re-render the tooltip when the user currently hovers it e.g. on town switch to update trade ratio correctly.
         * Since we can not distinguish which kind of tooltip is to update, we re-render all of them.
         * We do this by hiding the tooltip and then simulating the mouse move, to run through the complete render code again
         */
        refreshBPVTooltips: function () {
            if (Features.battlepointVillagesEnabled() && this.mousePopup.enabled) {
                this.mousePopup.onOutAnimationComplete();	// = hide

                // trigger mousemove on the saved target, but make it look like we come from somewhere else
                var $target = $(this.mouseOverTarget);
                this.mouseOverTarget = null;

                $target.trigger(move_name);
            }
        }
    };
});
