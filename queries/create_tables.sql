-- Drop Tables if they exist
DROP TABLE IF EXISTS PlayerSeasonalDetails;
DROP TABLE IF EXISTS UnderstatPlayerStats;
DROP TABLE IF EXISTS Fixtures;
DROP TABLE IF EXISTS GameWeekPlayerStats;
DROP TABLE IF EXISTS GameWeeks;
DROP TABLE IF EXISTS PlayerSeasonStats;
DROP TABLE IF EXISTS Players;
DROP TABLE IF EXISTS Teams;
DROP TABLE IF EXISTS Seasons;

CREATE TABLE Seasons (
    season_id INT PRIMARY KEY,
    start_year INT,
    end_year INT
);

CREATE TABLE Teams (
    team_id INT,
    season_id INT,
    team_name VARCHAR(255),
    code INT,
    draw INT,
    form VARCHAR(50),
    loss INT,
    played INT,
    points INT,
    position INT,
    short_name VARCHAR(50),
    strength INT,
    team_division VARCHAR(50),
    unavailable BOOLEAN,
    win INT,
    strength_overall_home INT,
    strength_overall_away INT,
    strength_attack_home INT,
    strength_attack_away INT,
    strength_defence_home INT,
    strength_defence_away INT,
    pulse_id INT,
    PRIMARY KEY (team_id, season_id),
    FOREIGN KEY (season_id) REFERENCES Seasons(season_id)
);


CREATE TABLE Players (
    player_id INT PRIMARY KEY,
    name VARCHAR(255),
    position VARCHAR(50)
);

CREATE TABLE PlayerSeasonStats (
    stat_id INT PRIMARY KEY,
    player_id INT,
    season_id INT,
    team_id INT,
    assists INT,
    bonus INT,
    points INT,
    bps INT,
    clean_sheets INT,
    creativity FLOAT,
    element INT,
    end_cost INT,
    goals_conceded INT,
    goals_scored INT,
    ict_index FLOAT,
    influence FLOAT,
    minutes INT,
    own_goals INT,
    penalties_missed INT,
    penalties_saved INT,
    red_cards INT,
    saves INT,
    start_cost INT,
    threat FLOAT,
    total_points INT,
    transfers_balance INT,
    transfers_in INT,
    transfers_out INT,
    value INT,
    yellow_cards INT,
    FOREIGN KEY (player_id) REFERENCES Players(player_id),
    FOREIGN KEY (season_id) REFERENCES Seasons(season_id),
    FOREIGN KEY (team_id) REFERENCES Teams(team_id)
);

CREATE TABLE GameWeeks (
    gw_id INT PRIMARY KEY,
    season_id INT,
    number INT,
    FOREIGN KEY (season_id) REFERENCES Seasons(season_id)
);

CREATE TABLE GameWeekPlayerStats (
    gw_player_stat_id INT PRIMARY KEY,
    player_id INT,
    gw_id INT,
    team_id INT,
    xP FLOAT,
    assists INT,
    bonus INT,
    bps INT,
    clean_sheets INT,
    creativity FLOAT,
    element INT,
    end_cost INT,
    goals_conceded INT,
    goals_scored INT,
    ict_index FLOAT,
    influence FLOAT,
    minutes INT,
    own_goals INT,
    penalties_missed INT,
    penalties_saved INT,
    red_cards INT,
    saves INT,
    start_cost INT,
    threat FLOAT,
    total_points INT,
    transfers_balance INT,
    transfers_in INT,
    transfers_out INT,
    value INT,
    yellow_cards INT,
    FOREIGN KEY (player_id) REFERENCES Players(player_id),
    FOREIGN KEY (gw_id) REFERENCES GameWeeks(gw_id),
    FOREIGN KEY (team_id) REFERENCES Teams(team_id)
);

CREATE TABLE Fixtures (
    fixture_id INT PRIMARY KEY,
    season_id INT,
    event INT,
    finished BOOLEAN,
    kickoff_time DATETIME,
    team_a INT,
    team_a_score INT,
    team_h INT,
    team_h_score INT,
    team_h_difficulty INT,
    team_a_difficulty INT,
    pulse_id INT,
    FOREIGN KEY (season_id) REFERENCES Seasons(season_id),
    FOREIGN KEY (team_a) REFERENCES Teams(team_id),
    FOREIGN KEY (team_h) REFERENCES Teams(team_id)
);

CREATE TABLE UnderstatPlayerStats (
    understat_player_stat_id INT PRIMARY KEY,
    player_id INT,
    season_id INT,
    goals INT,
    shots INT,
    xG FLOAT,
    time INT,
    position VARCHAR(50),
    h_team VARCHAR(255),
    a_team VARCHAR(255),
    h_goals INT,
    a_goals INT,
    date DATE,
    roster_id INT,
    xA FLOAT,
    assists INT,
    key_passes INT,
    npg INT,
    npxG FLOAT,
    xGChain FLOAT,
    xGBuildup FLOAT,
    FOREIGN KEY (player_id) REFERENCES Players(player_id),
    FOREIGN KEY (season_id) REFERENCES Seasons(season_id)
);

CREATE TABLE PlayerSeasonalDetails (
    detail_id INT PRIMARY KEY,
    player_id INT,
    season_id INT,
    assists INT,
    bonus INT,
    bps INT,
    clean_sheets INT,
    creativity FLOAT,
    end_cost INT,
    goals_conceded INT,
    goals_scored INT,
    ict_index FLOAT,
    influence FLOAT,
    minutes INT,
    own_goals INT,
    penalties_missed INT,
    penalties_saved INT,
    red_cards INT,
    saves INT,
    start_cost INT,
    threat FLOAT,
    total_points INT,
    yellow_cards INT,
    FOREIGN KEY (player_id) REFERENCES Players(player_id),
    FOREIGN KEY (season_id) REFERENCES Seasons(season_id)
);