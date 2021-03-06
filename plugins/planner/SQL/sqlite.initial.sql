CREATE TABLE IF NOT EXISTS planner (
  id integer NOT NULL PRIMARY KEY,
  user_id integer NOT NULL default '0',
  starred tinyint(1) NOT NULL default '0',
  datetime datetime default NULL,
  created datetime default NULL,
  text text NOT NULL,
  done tinyint(1) NOT NULL default '0',
  deleted tinyint(1) NOT NULL default '0',
  CONSTRAINT user_id_fk_planner FOREIGN KEY (user_id)
  REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS 'system' (
  name varchar(64) NOT NULL PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO system (name, value) VALUES ('myrc_planner', 'initial');