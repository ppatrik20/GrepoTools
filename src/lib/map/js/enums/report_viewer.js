/* global PlaceWindowFactory */
var ReportViewer = {
	dates: [],

	/**
	 * Report raw data. Contains a FightReport.
	 */
	data : {},

	/**
	 * Remembers the rounds in the fight
	 */
	rounds : [],

	/**
	 * Initializes the viewer
	 *
	 * @param Object data
	 */
	initialize: function(data){
		ReportViewer.rounds = [];

		ReportViewer.data = ReportViewer.processData(data);
	},

	/**
	 * Processes input data and calculates stuff for later use
	 *
	 * @param Object data fight report data
	 */
	processData: function(data){
		// check out what rounds the fight had
		for (var i in data.result.att_units) {
			if(data.result.att_units.hasOwnProperty(i)) {
				ReportViewer.rounds.push(i);
			}
		}

		for (var j in data.result.def_units) {
			if(data.result.def_units.hasOwnProperty(j) &&
				!data.result.att_units.hasOwnProperty(j)) {
				ReportViewer.rounds.push(j);
			}
		}

		return data;
	},

	/**
	 * opens the fight simulator and insert remaining units of fight
	 *
	 * @param att Bool - show remaining attacker_units
	 * @param def Bool - show remaining defender_units
	 * @param id Integer - report_id
	 */
	insertRemainingUnitsToSimulator: function(att, def, id) {
		var units = {};

		if (id) {
			ReportViewer.initialize(ReportViewer.dates[id]);
		}

		if (def) {
			units.def = ReportViewer.data.remaining_units_def;
		}
		if (att) {
			units.att = ReportViewer.data.remaining_units_att;
		}

		PlaceWindowFactory.openPlaceWindow('simulator', units);
	},

	/**
	 * opens the fight simulator and insert all units that participated in the fight
	 *
	 * @param att Bool - show attacker_units
	 * @param def Bool - show defender_units
	 * @param id Integer - report_id
	 */
	insertAllUnitsToSimulator: function(att, def, id) {
		var units = {}, round, unit;

		if (id) {
			ReportViewer.initialize(ReportViewer.dates[id]);
		}

		if (def) {
			var defUnitData = ReportViewer.data.result.def_units;

			units.def = {};
			for(round in defUnitData) {
				if (defUnitData.hasOwnProperty(round)) {
					if ($.inArray(''+round, ReportViewer.rounds) !== -1) {
						for (unit in defUnitData[round].had) {
							if (defUnitData[round].had.hasOwnProperty(unit)) {
								units.def[unit] = defUnitData[round].had[unit];
							}
						}
					}

					break; // Show units from the first round, these are all the ones involved in the fight
				}
			}
		}
		if (att) {
			var attUnitData = ReportViewer.data.result.att_units;

			units.att = {};
			for(round in attUnitData) {
				if (attUnitData.hasOwnProperty(round)) {
					if ($.inArray(''+round, ReportViewer.rounds) !== -1) {
						for (unit in attUnitData[round].had) {
							if (attUnitData[round].had.hasOwnProperty(unit)) {
								units.att[unit] = attUnitData[round].had[unit];
							}
						}
					}

					break; // Show units from the first round, these are all the ones involved in the fight
				}
			}
		}

		PlaceWindowFactory.openPlaceWindow('simulator', units);
	}
};
