-- Update awards table to use SVG icon keys instead of emojis
-- Run this in your D1 database via wrangler d1 execute

-- Streak & Consistency
UPDATE awards SET icon = 'first_dip_round' WHERE name = 'First Dip' OR id = 'first_dip';
UPDATE awards SET icon = 'back_to_back_hex' WHERE name = 'Back-to-Back' OR id = 'back_to_back';
UPDATE awards SET icon = 'triple_threat_shield' WHERE name = 'Triple Threat' OR id = 'triple_threat';
UPDATE awards SET icon = 'perfect_week_round' WHERE name = 'Perfect Week' OR id = 'perfect_week';
UPDATE awards SET icon = 'four_week_flow_hex' WHERE name = 'Four-Week Flow' OR name = '4-Week Flow' OR id = 'four_week_flow';
UPDATE awards SET icon = 'twelve_week_habit_shield' WHERE name = '12-Week Habit' OR name = 'Twelve-Week Habit' OR id = 'twelve_week_habit';
UPDATE awards SET icon = 'unbroken_month_round' WHERE name = 'Unbroken Month' OR id = 'unbroken_month';
UPDATE awards SET icon = 'streak_saver_hex' WHERE name = 'Streak Saver' OR id = 'streak_saver';

-- Session Milestones
UPDATE awards SET icon = 'sessions_5_round' WHERE name = '5 Sessions' OR id = 'sessions_5';
UPDATE awards SET icon = 'sessions_10_hex' WHERE name = '10 Sessions' OR id = 'sessions_10';
UPDATE awards SET icon = 'sessions_25_shield' WHERE name = '25 Sessions' OR id = 'sessions_25';
UPDATE awards SET icon = 'sessions_50_round' WHERE name = '50 Sessions' OR id = 'sessions_50';
UPDATE awards SET icon = 'sessions_100_hex' WHERE name = '100 Sessions' OR id = 'sessions_100';
UPDATE awards SET icon = 'club_200_shield' WHERE name = '200 Club' OR id = 'club_200';
UPDATE awards SET icon = 'season_centurion_round' WHERE name = 'Season Centurion' OR id = 'season_centurion';

-- Reliability
UPDATE awards SET icon = 'on_time_hex' WHERE name = 'On Time' OR id = 'on_time';
UPDATE awards SET icon = 'dependable_shield' WHERE name = 'Dependable' OR id = 'dependable';
UPDATE awards SET icon = 'ironclad_round' WHERE name = 'Ironclad' OR id = 'ironclad';
UPDATE awards SET icon = 'always_ready_hex' WHERE name = 'Always Ready' OR id = 'always_ready';

-- Day-specific
UPDATE awards SET icon = 'thursday_regular_shield' WHERE name = 'Thursday Regular' OR id = 'thursday_regular';
UPDATE awards SET icon = 'sunday_specialist_round' WHERE name = 'Sunday Specialist' OR id = 'sunday_specialist';

-- RSVP timing
UPDATE awards SET icon = 'early_bird_hex' WHERE name = 'Early Bird' OR id = 'early_bird';
UPDATE awards SET icon = 'last_minute_hero_shield' WHERE name = 'Last Minute Hero' OR id = 'last_minute_hero';

-- Social / Team
UPDATE awards SET icon = 'squad_builder_round' WHERE name = 'Squad Builder' OR id = 'squad_builder';
UPDATE awards SET icon = 'full_bench_hex' WHERE name = 'Full Bench' OR id = 'full_bench';
UPDATE awards SET icon = 'captains_pick_shield' WHERE name = "Captain's Pick" OR name = 'Captains Pick' OR id = 'captains_pick';

-- Positions & Teams
UPDATE awards SET icon = 'white_cap_round' WHERE name = 'White Cap' OR id = 'white_cap';
UPDATE awards SET icon = 'black_cap_hex' WHERE name = 'Black Cap' OR id = 'black_cap';
UPDATE awards SET icon = 'forward_line_shield' WHERE name = 'Forward Line' OR id = 'forward_line';
UPDATE awards SET icon = 'wing_runner_round' WHERE name = 'Wing Runner' OR id = 'wing_runner';
UPDATE awards SET icon = 'centre_control_hex' WHERE name = 'Centre Control' OR id = 'centre_control';
UPDATE awards SET icon = 'backline_anchor_shield' WHERE name = 'Backline Anchor' OR id = 'backline_anchor';
UPDATE awards SET icon = 'utility_player_round' WHERE name = 'Utility Player' OR id = 'utility_player';
UPDATE awards SET icon = 'third_team_hex' WHERE name = 'Third Team' OR id = 'third_team';

-- Competition & Travel
UPDATE awards SET icon = 'first_friendly_round' WHERE name = 'First Friendly' OR id = 'first_friendly';
UPDATE awards SET icon = 'tournament_debut_hex' WHERE name = 'Tournament Debut' OR id = 'tournament_debut';
UPDATE awards SET icon = 'road_trip_shield' WHERE name = 'Road Trip' OR id = 'road_trip';
UPDATE awards SET icon = 'international_waters_round' WHERE name = 'International Waters' OR id = 'international_waters';
UPDATE awards SET icon = 'camp_week_hex' WHERE name = 'Camp Week' OR id = 'camp_week';
UPDATE awards SET icon = 'finals_ready_shield' WHERE name = 'Finals Ready' OR id = 'finals_ready';

-- Anniversary
UPDATE awards SET icon = 'anniversary_1y_round' WHERE name LIKE '%1 Year%' OR name LIKE '%1y%' OR id = 'anniversary_1y';
UPDATE awards SET icon = 'anniversary_5y_hex' WHERE name LIKE '%5 Year%' OR name LIKE '%5y%' OR id = 'anniversary_5y';
UPDATE awards SET icon = 'anniversary_10y_shield' WHERE name LIKE '%10 Year%' OR name LIKE '%10y%' OR id = 'anniversary_10y';

-- Seasonal
UPDATE awards SET icon = 'new_year_splash_round' WHERE name = 'New Year Splash' OR id = 'new_year_splash';
UPDATE awards SET icon = 'spring_surge_hex' WHERE name = 'Spring Surge' OR id = 'spring_surge';
UPDATE awards SET icon = 'summer_series_shield' WHERE name = 'Summer Series' OR id = 'summer_series';
