/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8mb4 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;

-- Dumping structure for table kstalk.cache_players
CREATE TABLE IF NOT EXISTS `cache_players` (
  `username` varchar(20) NOT NULL,
  `active` tinyint(3) unsigned NOT NULL,
  `banned` tinyint(3) unsigned NOT NULL,
  `gold` tinyint(3) unsigned NOT NULL,
  `role` tinyint(3) unsigned NOT NULL,
  `action` tinyint(3) unsigned DEFAULT NULL,
  `lastUpdate` varchar(19) DEFAULT NULL,
  `serverIP` varchar(15) DEFAULT NULL,
  `serverPort` smallint(5) unsigned DEFAULT NULL,
  `updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ping` int(11) NOT NULL,
  PRIMARY KEY (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Dumping structure for table kstalk.cache_servers
CREATE TABLE IF NOT EXISTS `cache_servers` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `DNCycle` tinyint(1) NOT NULL,
  `DNState` tinyint(1) NOT NULL,
  `build` smallint(5) unsigned NOT NULL,
  `connectable` tinyint(1) NOT NULL,
  `currentPlayers` int(10) unsigned NOT NULL,
  `description` varchar(200) NOT NULL,
  `firstSeen` varchar(19) NOT NULL,
  `gameMode` varchar(200) NOT NULL,
  `gameState` tinyint(3) unsigned NOT NULL,
  `gid` int(10) unsigned NOT NULL,
  `gold` tinyint(1) NOT NULL,
  `lastUpdate` varchar(19) NOT NULL,
  `mapH` int(10) unsigned NOT NULL,
  `mapW` int(10) unsigned NOT NULL,
  `maxPlayers` int(10) unsigned NOT NULL,
  `maxSpectatorPlayers` int(10) unsigned NOT NULL,
  `password` varchar(200) NOT NULL,
  `reservedPlayers` int(10) unsigned NOT NULL,
  `serverIPv4Address` varchar(15) NOT NULL,
  `serverIPv6Address` varchar(39) NOT NULL,
  `serverName` varchar(200) NOT NULL,
  `serverPort` smallint(5) unsigned NOT NULL,
  `spectatorPlayers` int(10) unsigned NOT NULL,
  `updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Dumping structure for table kstalk.connections
CREATE TABLE IF NOT EXISTS `connections` (
  `ip` varchar(200) NOT NULL,
  `lastUpdate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ip`),
  KEY `ip` (`ip`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IF(@OLD_FOREIGN_KEY_CHECKS IS NULL, 1, @OLD_FOREIGN_KEY_CHECKS) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
