const dbClient = require("./astraClient");

const createTables = async () => {
  try {
    console.log("Starting table creation...");

    // Drop existing tables if they exist
    try {
      await dbClient.collection("Fixtures").drop();
      await dbClient.collection("Players").drop();
      await dbClient.collection("Teams").drop();
      await dbClient.collection("Seasons").drop();
      await dbClient.collection("Gameweeks").drop();
      console.log("Existing tables dropped successfully.");
    } catch (error) {
      console.error("Error dropping tables (may not exist yet):", error);
    }

    // Create Seasons table
    await dbClient.createCollection("seasons", {
      season_id: { type: "int", primaryKey: true },
      start_year: "int",
      end_year: "int",
    });
    console.log("Seasons table created.");

    // Create Teams table
    await dbClient.createCollection("teams", {
      team_id: { type: "int", primaryKey: true },
      season_id: "int",
      code: "int",
      draw: "int",
      form: "int",
      loss: "int",
      team_name: "varchar",
      played: "int",
      points: "int",
      position: "int",
      short_name: "varchar",
      strength: "int",
      team_division: "int",
      unavailable: "boolean",
      win: "int",
      strength_overall_home: "int",
      strength_overall_away: "int",
      strength_attack_home: "int",
      strength_attack_away: "int",
      strength_defence_home: "int",
      strength_defence_away: "int",
      pulse_id: "int",
    });
    console.log("Teams table created.");

    // Create Fixtures table
    await dbClient.createCollection("fixtures", {
      fixture_id: { type: "int", primaryKey: true },
      season_id: "int",
      code: "int",
      event: "int",
      finished: "boolean",
      finished_provisional: "boolean",
      kickoff_time: "timestamp",
      minutes: "int",
      provisional_start_time: "boolean",
      started: "boolean",
      team_a: "int",
      team_a_score: "int",
      team_h: "int",
      team_h_score: "int",
      team_h_difficulty: "int",
      team_a_difficulty: "int",
      pulse_id: "int",
    });
    console.log("Fixtures table created.");

    // Create Players table
    await dbClient.createCollection("players", {
      player_id: { type: "int", primaryKey: true },
      season_id: "int",
      chance_of_playing_next_round: "int",
      chance_of_playing_this_round: "int",
      code: "int",
      cost_change_event: "int",
      cost_change_event_fall: "int",
      cost_change_start: "int",
      cost_change_start_fall: "int",
      dreamteam_count: "int",
      element_type: "int",
      ep_next: "float",
      ep_this: "float",
      event_points: "int",
      first_name: "varchar",
      form: "float",
      in_dreamteam: "boolean",
      news: "text",
      news_added: "timestamp",
      now_cost: "int",
      photo: "varchar",
      points_per_game: "float",
      second_name: "varchar",
      selected_by_percent: "float",
      special: "boolean",
      squad_number: "int",
      status: "varchar",
      team_id: "int",
      team_code: "int",
      total_points: "int",
      transfers_in: "int",
      transfers_in_event: "int",
      transfers_out: "int",
      transfers_out_event: "int",
      value_form: "float",
      value_season: "float",
      web_name: "varchar",
      minutes: "int",
      goals_scored: "int",
      assists: "int",
      clean_sheets: "int",
      goals_conceded: "int",
      own_goals: "int",
      penalties_saved: "int",
      penalties_missed: "int",
      yellow_cards: "int",
      red_cards: "int",
      saves: "int",
      bonus: "int",
      bps: "int",
      influence: "float",
      creativity: "float",
      threat: "float",
      ict_index: "float",
      starts: "int",
      expected_goals: "float",
      expected_assists: "float",
      expected_goal_involvements: "float",
      expected_goals_conceded: "float",
      influence_rank: "int",
      influence_rank_type: "int",
      creativity_rank: "int",
      creativity_rank_type: "int",
      threat_rank: "int",
      threat_rank_type: "int",
      ict_index_rank: "int",
      ict_index_rank_type: "int",
      corners_and_indirect_freekicks_order: "int",
      corners_and_indirect_freekicks_text: "text",
      direct_freekicks_order: "int",
      direct_freekicks_text: "text",
      penalties_order: "int",
      penalties_text: "text",
      expected_goals_per_90: "float",
      saves_per_90: "float",
      expected_assists_per_90: "float",
      expected_goal_involvements_per_90: "float",
      expected_goals_conceded_per_90: "float",
      goals_conceded_per_90: "float",
      now_cost_rank: "int",
      now_cost_rank_type: "int",
      form_rank: "int",
      form_rank_type: "int",
      points_per_game_rank: "int",
      points_per_game_rank_type: "int",
      selected_rank: "int",
      selected_rank_type: "int",
      starts_per_90: "float",
      clean_sheets_per_90: "float",
    });
    console.log("Players table created.");

    // Create Gameweeks table
    await dbClient.createCollection("gameweeks", {
      id: { type: "int", primaryKey: true },
      name: "varchar",
      deadline_time: "timestamp",
      average_entry_score: "int",
      finished: "boolean",
      data_checked: "boolean",
      highest_scoring_entry: "int",
      deadline_time_epoch: "bigint",
      deadline_time_game_offset: "int",
      highest_score: "int",
      is_previous: "boolean",
      is_current: "boolean",
      is_next: "boolean",
      cup_leagues_created: "boolean",
      h2h_ko_matches_created: "boolean",
      most_selected: "int",
      most_transferred_in: "int",
      top_element: "int",
      transfers_made: "bigint",
      most_captained: "int",
      most_vice_captained: "int",
    });
    console.log("Gameweeks table created.");

    console.log("Tables created successfully.");
  } catch (error) {
    console.error("Error creating tables:", error);
  }
};

createTables().catch(console.error);
