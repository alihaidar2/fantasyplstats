DROP TABLE IF EXISTS Fixtures;
DROP TABLE IF EXISTS Players;
DROP TABLE IF EXISTS Teams;
DROP TABLE IF EXISTS Seasons;
DROP TABLE IF EXISTS Gameweeks;

CREATE TABLE Seasons (
    season_id INT PRIMARY KEY,
    start_year INT,
    end_year INT
);

CREATE TABLE Teams (
    team_id INT PRIMARY KEY,
    season_id INT REFERENCES Seasons(season_id),
    code INT,
    draw INT,
    form INT, -- Nullable, as form can be null
    loss INT,
    team_name VARCHAR(255),
    played INT,
    points INT,
    position INT,
    short_name VARCHAR(255),
    strength INT,
    team_division INT, -- Nullable, as team_division can be null
    unavailable BOOLEAN,
    win INT,
    strength_overall_home INT,
    strength_overall_away INT,
    strength_attack_home INT,
    strength_attack_away INT,
    strength_defence_home INT,
    strength_defence_away INT,
    pulse_id INT
);

CREATE TABLE Fixtures (
    fixture_id INT PRIMARY KEY,
    season_id INT REFERENCES Seasons(season_id),
    code INT,
    event INT,
    finished BOOLEAN,
    finished_provisional BOOLEAN,
    kickoff_time TIMESTAMP,
    minutes INT,
    provisional_start_time BOOLEAN,
    started BOOLEAN,
    team_a INT REFERENCES Teams(team_id),
    team_a_score INT,
    team_h INT REFERENCES Teams(team_id),
    team_h_score INT,
    team_h_difficulty INT,
    team_a_difficulty INT,
    pulse_id INT
);

CREATE TABLE Players (
    player_id INT PRIMARY KEY,
    season_id INT REFERENCES Seasons(season_id),
    chance_of_playing_next_round INT, -- Nullable, as this can be null
    chance_of_playing_this_round INT, -- Nullable, as this can be null
    code INT,
    cost_change_event INT,
    cost_change_event_fall INT,
    cost_change_start INT,
    cost_change_start_fall INT,
    dreamteam_count INT,
    element_type INT,
    ep_next FLOAT,
    ep_this FLOAT,
    event_points INT,
    first_name VARCHAR(255),
    form FLOAT,
    in_dreamteam BOOLEAN,
    news TEXT,
    news_added TIMESTAMP, -- Nullable, as news_added can be null
    now_cost INT,
    photo VARCHAR(255),
    points_per_game FLOAT,
    second_name VARCHAR(255),
    selected_by_percent FLOAT,
    special BOOLEAN,
    squad_number INT, -- Nullable, as squad_number can be null
    status VARCHAR(1),
    team_id INT REFERENCES Teams(team_id),
    team_code INT,
    total_points INT,
    transfers_in INT,
    transfers_in_event INT,
    transfers_out INT,
    transfers_out_event INT,
    value_form FLOAT,
    value_season FLOAT,
    web_name VARCHAR(255),
    minutes INT,
    goals_scored INT,
    assists INT,
    clean_sheets INT,
    goals_conceded INT,
    own_goals INT,
    penalties_saved INT,
    penalties_missed INT,
    yellow_cards INT,
    red_cards INT,
    saves INT,
    bonus INT,
    bps INT,
    influence FLOAT,
    creativity FLOAT,
    threat FLOAT,
    ict_index FLOAT,
    starts INT,
    expected_goals FLOAT,
    expected_assists FLOAT,
    expected_goal_involvements FLOAT,
    expected_goals_conceded FLOAT,
    influence_rank INT,
    influence_rank_type INT,
    creativity_rank INT,
    creativity_rank_type INT,
    threat_rank INT,
    threat_rank_type INT,
    ict_index_rank INT,
    ict_index_rank_type INT,
    corners_and_indirect_freekicks_order INT, -- Nullable, as this can be null
    corners_and_indirect_freekicks_text TEXT,
    direct_freekicks_order INT, -- Nullable, as this can be null
    direct_freekicks_text TEXT,
    penalties_order INT, -- Nullable, as this can be null
    penalties_text TEXT,
    expected_goals_per_90 FLOAT,
    saves_per_90 FLOAT,
    expected_assists_per_90 FLOAT,
    expected_goal_involvements_per_90 FLOAT,
    expected_goals_conceded_per_90 FLOAT,
    goals_conceded_per_90 FLOAT,
    now_cost_rank INT,
    now_cost_rank_type INT,
    form_rank INT,
    form_rank_type INT,
    points_per_game_rank INT,
    points_per_game_rank_type INT,
    selected_rank INT,
    selected_rank_type INT,
    starts_per_90 FLOAT,
    clean_sheets_per_90 FLOAT
);

CREATE TABLE Gameweeks (
    id INT PRIMARY KEY,
    name VARCHAR(255),
    deadline_time TIMESTAMP,
    average_entry_score INT,
    finished BOOLEAN,
    data_checked BOOLEAN,
    highest_scoring_entry INT,
    deadline_time_epoch BIGINT,
    deadline_time_game_offset INT,
    highest_score INT,
    is_previous BOOLEAN,
    is_current BOOLEAN,
    is_next BOOLEAN,
    cup_leagues_created BOOLEAN,
    h2h_ko_matches_created BOOLEAN,
    most_selected INT,
    most_transferred_in INT,
    top_element INT,
    transfers_made BIGINT,
    most_captained INT,
    most_vice_captained INT
);