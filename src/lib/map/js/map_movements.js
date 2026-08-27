/*globals MM, $, Game, GameEvents, Timestamp, DM */
/**
 * This class is used to calculate and draw the map movements on the map
 */
define('map/map_movements', function() {
	'use strict';

	var TOWN_WIDTH = 70;
	var TOWN_HEIGHT = 46;
	var PERCENTAGE_OF_MAIN_DIV_WIDTH = 90;
	var IMAGE_DOT_WIDTH = 13;

    /**
     * The attack spot renderer has a defined offset of -10 for rendering the icon
     * so we are using a offset too.
     */
    var ATTACK_SPOT_OFFSET = -10;

	return {

		initialize: function () {
		    var player_settings = MM.getModelByNameAndPlayerId('PlayerSettings');
            /**
             * check if the setting is enabled for the player,
             * if not don't draw the map movements
             */
		    if (!player_settings || !player_settings.areMapMovementsEnabled()) {
                return;
            }
            var unit_movements = MM.getCollections().MovementsUnits[0];
            this.prepareAllMapMovements(unit_movements);
            this.registerEventListeners();
		},

        /**
         *
         * Get movement direction to show the right icon
         */
		getMovementDirection: function(movement) {
		    if (movement.isAborted() && movement.isAttackSpotAttack()) {
                var existing_movement = $('#map_movements').find('.movement_main[data-movement="' + movement.getId() + '"]');
                return existing_movement.length ? existing_movement.data('direction') : 'incoming';
            }
			return movement.isIncomingMovement() ? 'incoming' : 'outgoing';
		},

        getMovementType: function(movement) {
		    if (movement.isAborted() && movement.isAttackSpotAttack()) {
		        return 'attack_land';
            } else {
		        return movement.getType();
            }
        },

		registerEventListeners: function() {
			MM.getCollections().MovementsUnits[0].on('add remove', this.addSingleMovement.bind(this));
			$.Observer(GameEvents.town.town_switch).unsubscribe('map_movements');
			$.Observer(GameEvents.town.town_switch).subscribe('map_movements', function() {
				var $movement_element = $('#map_movements').find('.movement_main');
				if ($movement_element.length) {
					for (var i = 0; i < $movement_element.length; i++) {
						var element = $($movement_element[i]);
						if (element.data('town') !== Game.townId) {
							element.remove();
						}
					}
				}
			});
		},

        /**
         * This is the main drawing function. It calculates the path length and sets the path position,
         * depending on the two given points. One point is always the current town the other one is
         * the given point, like for example attack spot for attack spot movements.
         */
        drawMovementPathWithIcon: function($movement, movement_model, other_movement_point_cooridnates) {
		    var $movement_icon_wrapper = $movement.find('.movement_icon_wrapper'),
                $movement_path_wrapper = $movement.find('.movement_path_wrapper'),
                $movement_moving_path = $movement.find('.movement_moving_path'),
                $movement_icon = $movement.find('.movement_icon'),
                current_town = MM.getCollections().Town[0].findWhere({id : Game.townId}),

                incoming = movement_model.isIncomingMovement(),
                x_pos_other_point = other_movement_point_cooridnates.x,
                y_pos_other_point = other_movement_point_cooridnates.y,
                x_pos_current_town = current_town.getAbsX(),
                y_pos_current_town = current_town.getAbsY(),
                half_town_width = Math.round(TOWN_WIDTH / 2),
                half_town_height = Math.round(TOWN_HEIGHT / 2),
                x1,x2,y1,y2;

            if (incoming) {
                x1 = x_pos_other_point;
                y1 = y_pos_other_point;
                x2 = x_pos_current_town;
                y2 = y_pos_current_town;
            } else {
                x1 = x_pos_current_town;
                y1 = y_pos_current_town;
                x2 = x_pos_other_point;
                y2 = y_pos_other_point;
            }

            var length = Math.round(Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2))),
                path_length = Math.round(length * PERCENTAGE_OF_MAIN_DIV_WIDTH / 100),
                even_path_length = path_length - (path_length % IMAGE_DOT_WIDTH),
                moving_path_steps = even_path_length / IMAGE_DOT_WIDTH,
                angle  = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI,
                transform = 'rotate(' + angle + 'deg)';

            $movement.width(length);
            $movement_path_wrapper.width(even_path_length);
            $movement.css({
                'transform': transform,
                'left': x1 + half_town_width,
                'top': y1 + half_town_height
            });

            $movement_moving_path.css({
                'animation': 'moveToEnd 3s steps(' + moving_path_steps + ') infinite'
            });

            var movement_icon_transform = 'rotate(' + (-(angle)) + 'deg)',
                movement_duration = movement_model.getArrivalAt() - Timestamp.now(),
                current_duration = Timestamp.now() - movement_model.getStartedAt(),
                full_duration = movement_model.getArrivalAt() - movement_model.getStartedAt(),
                starting_point_percent = Math.round((current_duration / full_duration) * 100),
                element_width = 100 - starting_point_percent;

            $movement_icon_wrapper.css({
                'animation': 'moveToEnd linear forwards',
                'animation-duration': movement_duration + 's',
                'left': starting_point_percent - 5 + '%',
                'width': element_width + '%'
            });

            $movement_icon.css({
                'transform': movement_icon_transform
            });
        },

        /**
         * General function for appending the new movement template to the main movement div.
         */
        showMovementOnMap: function(map_movement_id, movement_model, other_movement_point_cooridnates) {
            var $map_movements = $('#map_movements');

            $map_movements.append(us.template(DM.getTemplate('map', 'map_movement')) ({
                map_movement_id: map_movement_id,
                town_id: Game.townId,
                movement_direction: this.getMovementDirection(movement_model),
                movement_type: this.getMovementType(movement_model),
                model_id: movement_model.getId()
            }));
            var $movement = $('#' + map_movement_id);
            this.drawMovementPathWithIcon($movement, movement_model, other_movement_point_cooridnates);
        },

        /**
         * General function which takes the given movement and creates a unique id which will
         * be used for the movement tag. Either it will remove the movement it is already there, or
         * it will draw it.
         */
        prepareMapMovement: function(movement, other_movement_point_cooridnates) {
            var movement_direction = this.getMovementDirection(movement),
                movement_id = 'map_movement_' + movement.getId() + '_' + movement_direction,
                $movement = $("#" + movement_id);
            if ($movement.length) {
                $movement.remove();
                return;
            }
            this.showMovementOnMap(movement_id, movement, other_movement_point_cooridnates);
        },

        /**
         * This functions checks the active unit movements town collection for attack spot movements
         * and prepares them to be drawn to the map
         */
        prepareAttackSpotMovements: function(collection) {
            var attack_spot_movements = collection.filter(function(unit_movement) {
                return this.isAttackSpotMovement(unit_movement);
            }.bind(this));
            if (attack_spot_movements.length) {
                var other_movement_point_cooridnates = this.getAttackSpotAbsoluteCoordinates();
                attack_spot_movements.forEach(function(movement) {
                    this.prepareMapMovement(movement, other_movement_point_cooridnates);
                }.bind(this));
            }
		},

        /**
         * This function is used to prepare all movements.
         * For now we only show the attack spot movements.
         */
		prepareAllMapMovements: function(collection) {
			this.prepareAttackSpotMovements(collection);
		},

        /**
         * Check if movement is attack spot
         */
        isAttackSpotMovement: function(model) {
		    return (model.getType() === 'attack_land' || model.getType() === 'abort') && model.isAttackSpotAttack();
        },

        getAttackSpotAbsoluteCoordinates: function() {
            var attack_spot_model = MM.getModelByNameAndPlayerId('PlayerAttackSpot', Game.player_id),
                attack_spot_absolute_cooridnates = attack_spot_model.getAbsoluteCoordinates();
            return {
                x: ATTACK_SPOT_OFFSET + attack_spot_absolute_cooridnates.abs_x,
                y: ATTACK_SPOT_OFFSET + attack_spot_absolute_cooridnates.abs_y
            };
        },

        /**
         * Add single movemement, for example when a new movement gets added to the collection
         */
        addSingleMovement: function(model) {
		    var second_movement_point_coordinates;
		    if (model.isAttackSpotAttack()) {
                second_movement_point_coordinates = this.getAttackSpotAbsoluteCoordinates();
            }

            if (!second_movement_point_coordinates) {
		        return;
            }
            this.prepareMapMovement(model, second_movement_point_coordinates);
        }
	};
});
