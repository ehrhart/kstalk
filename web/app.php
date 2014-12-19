<?php
	header('Content-Type: application/json');
	
	// Config (change these vars)
	define('DB_HOST', 'localhost');
	define('DB_USERNAME', '');
	define('DB_PASSWORD', '');
	define('DB_NAME', 'kstalk');
	
	// Vars
	$BUILD = 6;
	$VERSION = '1.1.1';
	$DOWNLOAD_LINK = 'https://github.com/master4523/kstalk';
	$COMPATIBILITY = array(3, 4, 5, $BUILD, $BUILD+1);
	
	function esc($s) {
		return mysql_real_escape_string($s);
	}
	
	function get($url) {
		global $BUILD, $VERSION;
		$c = curl_init();
		curl_setopt($c, CURLOPT_URL, $url);
		curl_setopt($c, CURLOPT_HEADER, 0);
		curl_setopt($c, CURLOPT_RETURNTRANSFER, 1);
		curl_setopt($c, CURLOPT_CONNECTTIMEOUT, 1);
		curl_setopt($c, CURLOPT_TIMEOUT, 8);
		curl_setopt($c, CURLOPT_USERAGENT, 'KSTALK BUILD ' . $BUILD . ' (v' . $VERSION . ')');
		$content = curl_exec($c);
		curl_close($c);
		return $content;
	}

	function getData($d) {
		if (isset($d)) {
			if (is_bool($d)) {
				return $d == true ? 1 : 0;
			} else {
				return $d;
			}
		} else {
			return null;
		}
	}
	
	function arrayToObject($d) {
		if (is_array($d)) {
			return (object) array_map(__FUNCTION__, $d);
		}
		else {
			return $d;
		}
	}
	
	if (mysql_connect(DB_HOST, DB_USERNAME, DB_PASSWORD) === FALSE) {
		die(json_encode(array('success' => false, 'error' => 'Could not connect to the MySQL server.')));
	}
	if (mysql_select_db(DB_NAME) === FALSE) {
		die(json_encode(array('success' => false, 'error' => 'Could not select the database.')));
	}
	
	if (isset($_GET['watchlist']) && isset($_GET['username'])) {
		$before = microtime(true);
		$username = $_GET['username'];
		$a = array();
		$exists = false;
		$status = 'Unknown status';
		$hasServer = false;
		$player_cached = false;
		$server_cached = false;
		$a = array();
		
		$res = mysql_query('SELECT * FROM cache_players WHERE username = "' . $username .'" LIMIT 1') or die(mysql_error());
		$pi_updated = 0;
		$online = false;
		if (mysql_num_rows($res) > 0) {
			$row = mysql_fetch_assoc($res);
			$pi_updated = strtotime($row['updated']);
		}
		if (time() - $pi_updated <= 60) { // 1 minute
			// Use cache
			$pi_username = getData($row['username']);
			$pi_active = getData($row['active']);
			$pi_banned = getData($row['banned']);
			$pi_gold = getData($row['gold']);
			$pi_role = getData($row['role']);
			$pi_action = getData($row['action']);
			$pi_lastUpdate = getData($row['lastUpdate']);
			$pi_serverIP = getData($row['serverIP']);
			$pi_serverPort = getData($row['serverPort']);
			$player_cached = true;
			$exists = true;
			$hasServer = ($pi_serverIP !== 'NULL');
		} else {
			// Update
			$data = json_decode(get('https://api.kag2d.com/player/' . $username . '/status'));
			if (is_null($data)) {
				print json_encode(array('error' => 'Could not contact the API server'));
				exit;
			}
			if (!isset($data->playerInfo)) {
				$exists = false;
				$status = "This player doesn't exist";
			} else {
				$exists = true;
				$pi_username = getData($data->playerInfo->username);
				$pi_active = getData($data->playerInfo->active);
				$pi_banned = getData($data->playerInfo->banned);
				$pi_gold = getData($data->playerInfo->gold);
				$pi_role = getData($data->playerInfo->role);
				//TODO: sometimes the player has a server but the api won't show the server infos (eg: Teemo, $data->playerStatus->server doesn't exist)
				if (isset($data->playerStatus) && isset($data->playerStatus->server)) {
					$hasServer = true;
					$pi_action = getData($data->playerStatus->action);
					$pi_lastUpdate = getData($data->playerStatus->lastUpdate);
					$pi_serverIP = getData($data->playerStatus->server->serverIPv4Address);
					$pi_serverPort = getData($data->playerStatus->server->serverPort);
				} else {
					$hasServer = false;
					$pi_action = 'NULL';
					$pi_lastUpdate = 'NULL';
					$pi_serverIP = 'NULL';
					$pi_serverPort = 'NULL';
				}
				mysql_query('INSERT INTO `cache_players` (`username`, `active`, `banned`, `gold`, `role`, `action`, `lastUpdate`, `serverIP`, `serverPort`, `updated`, `ping`) VALUES("'.$pi_username.'", '.$pi_active.', '.$pi_banned.', '.$pi_gold.', '.$pi_role.', '.$pi_action.', "'.$pi_lastUpdate.'", "'.$pi_serverIP.'", '.$pi_serverPort.', NOW(), 0) ON DUPLICATE KEY UPDATE `active` = '.$pi_active.', `banned` = '.$pi_banned.', `gold` = '.$pi_gold.', `role` = '.$pi_role.', `action` = '.$pi_action.', `lastUpdate` = "'.$pi_lastUpdate.'", `serverIP` = "'.$pi_serverIP.'", `serverPort` = '.$pi_serverPort.', `updated` = NOW()') or die(mysql_error());
				$player_cached = false;
			}
		}
		
		if ($exists) {
			mysql_query('UPDATE `cache_players` SET `ping` = `ping` + 1 WHERE `username` = "' . $pi_username . '"');
			
			if ($hasServer) {
				// Get server
				$res = mysql_query('SELECT * FROM `cache_servers` WHERE `serverIPv4Address` = "'.$pi_serverIP.'" AND `serverPort` = '.$pi_serverPort.' LIMIT 1') or die(mysql_error());
				$si_updated = 0;
				if (mysql_num_rows($res) > 0) {
					$row = mysql_fetch_assoc($res);
					$si_updated = strtotime($row['updated']);
				}
				if (time() - $si_updated <= 60*60) { // 1 hour
					// Use cache
					$server_cached = true;
					$si_name = getData($row['serverName']);
					$dataServer = arrayToObject(array("serverStatus" => $row));
				} else {
					// Update
					$server_cached = false;
					$dataServer = json_decode(get('https://api.kag2d.com/server/ip/'.$pi_serverIP.'/port/'.$pi_serverPort.'/status'));
					$si_name = getData($dataServer->serverStatus->serverName);
					// Fix for ipv6
					if (!isset($dataServer->serverStatus->serverIPv6Address)) {
						$dataServer->serverStatus->serverIPv6Address = '';
					}
				}
				if (mysql_num_rows($res) == 0) {
					// Doesn't exist in db
					mysql_query('
						INSERT INTO `cache_servers` (`id`, `DNCycle`, `DNState`, `build`, `connectable`, `currentPlayers`, `description`, `firstSeen`, `gameMode`, `gameState`, `gid`, `gold`, `lastUpdate`, `mapH`, `mapW`, `maxPlayers`, `maxSpectatorPlayers`, `password`, `reservedPlayers`, `serverIPv4Address`, `serverIPv6Address`, `serverName`, `serverPort`, `spectatorPlayers`, `updated`)
						VALUES(
							NULL,
							'.esc($dataServer->serverStatus->DNCycle).',
							'.esc($dataServer->serverStatus->DNState).',
							'.esc($dataServer->serverStatus->build).',
							'.esc($dataServer->serverStatus->connectable).',
							'.esc($dataServer->serverStatus->currentPlayers).',
							"'.esc($dataServer->serverStatus->description).'",
							"'.esc($dataServer->serverStatus->firstSeen).'",
							"'.esc($dataServer->serverStatus->gameMode).'",
							'.esc($dataServer->serverStatus->gameState).',
							'.esc($dataServer->serverStatus->gid).',
							'.esc($dataServer->serverStatus->gold).',
							"'.esc($dataServer->serverStatus->lastUpdate).'",
							'.esc($dataServer->serverStatus->mapH).',
							'.esc($dataServer->serverStatus->mapW).',
							'.esc($dataServer->serverStatus->maxPlayers).',
							'.esc($dataServer->serverStatus->maxSpectatorPlayers).',
							'.esc($dataServer->serverStatus->password).',
							'.esc($dataServer->serverStatus->reservedPlayers).',
							"'.esc($dataServer->serverStatus->serverIPv4Address).'",
							"'.esc($dataServer->serverStatus->serverIPv6Address).'",
							"'.esc($dataServer->serverStatus->serverName).'",
							'.esc($dataServer->serverStatus->serverPort).',
							'.esc($dataServer->serverStatus->spectatorPlayers).',
							NOW()
						)
					') or die(mysql_error());
				} else {
					mysql_query(
						'UPDATE `cache_servers` SET
						`DNCycle` = '.esc($dataServer->serverStatus->DNCycle).',
						`DNState` = '.esc($dataServer->serverStatus->DNState).',
						`build` = '.esc($dataServer->serverStatus->build).',
						`connectable` = '.esc($dataServer->serverStatus->connectable).',
						`currentPlayers` = '.esc($dataServer->serverStatus->currentPlayers).',
						`description` = "'.esc($dataServer->serverStatus->description).'",
						`firstSeen` = "'.esc($dataServer->serverStatus->firstSeen).'",
						`gameMode` = "'.esc($dataServer->serverStatus->gameMode).'",
						`gameState` = '.esc($dataServer->serverStatus->gameState).',
						`gid` = '.esc($dataServer->serverStatus->gid).',
						`gold` = '.esc($dataServer->serverStatus->gold).',
						`lastUpdate` = "'.esc($dataServer->serverStatus->lastUpdate).'",
						`mapH` = '.esc($dataServer->serverStatus->mapH).',
						`mapW` = '.esc($dataServer->serverStatus->mapW).',
						`maxPlayers` = '.esc($dataServer->serverStatus->maxPlayers).',
						`maxSpectatorPlayers` = '.esc($dataServer->serverStatus->maxSpectatorPlayers).',
						`password` = '.esc($dataServer->serverStatus->password).',
						`reservedPlayers` = '.esc($dataServer->serverStatus->reservedPlayers).',
						`serverIPv4Address` = "'.esc($dataServer->serverStatus->serverIPv4Address).'",
						`serverIPv6Address` = "'.esc($dataServer->serverStatus->serverIPv6Address).'",
						`serverName` = "'.esc($dataServer->serverStatus->serverName).'",
						`serverPort` = '.esc($dataServer->serverStatus->serverPort).',
						`spectatorPlayers` = '.esc($dataServer->serverStatus->spectatorPlayers).',
						`updated` = NOW()
						WHERE `serverIPv4Address` = "' . esc($dataServer->serverStatus->serverIPv4Address) . '" AND `serverPort` = "' . esc($dataServer->serverStatus->serverPort) . '"');
				}
				
				if(!is_null($pi_lastUpdate) && !is_null($pi_serverIP) && !is_null($pi_serverPort) && time()-date("Z",time()) - strtotime($pi_lastUpdate) <= 65) {
					$online = true;
					$status = 'Online and playing';
					if (isset($dataServer->serverStatus)) {
						$status .= ' in <strong>' . $dataServer->serverStatus->serverName . '</strong>';
					} else {
						$status .= ' in a server';
					}
				} else {
					$status = '';
					if (isset($dataServer->serverStatus)) {
						$status .= '<small>Last seen on: </small><a href="kag://' . $dataServer->serverStatus->serverIPv4Address . ':' . $dataServer->serverStatus->serverPort . '"><strong><small>' . $dataServer->serverStatus->serverName.'</small></strong></a>';
						if (!is_null($pi_lastUpdate)) {
							$statusString = '';
							$timeAgo = time()-date("Z",time()) - strtotime($pi_lastUpdate);
							$days = ($timeAgo-$timeAgo%86400)/86400;
							if($days > 0)
								$statusString .= $days.'d';
							$timeAgo -= $days*86400;
							$hours = ($timeAgo-$timeAgo%3600)/3600;
							if($hours > 0)
								$statusString .= $hours.'h';
							$timeAgo -= $hours*3600;
							$minutes = ($timeAgo-$timeAgo%60)/60;
							if($minutes > 0)
								$statusString .= $minutes.'m';
							$timeAgo -= $minutes*60;
							$seconds = $timeAgo;
							$statusString .= $seconds . 's';
							$status .= '<small>, ' . $statusString . " ago</small>";
						}
					}
				}
			} else {
				//$status = 'Unknown status'; // Already defined
			}
			
			// Get avatar
			$dataAvatar = json_decode(get('https://api.kag2d.com/player/' . $username . '/avatar'));
			if (isset($dataAvatar->small) && isset($dataAvatar->medium) && isset($dataAvatar->large)) {
				$a['avatar'] = $dataAvatar;
			} else {
				$a['avatar'] = null;
			}
		}
		
		$a['player_cached'] = $player_cached;
		$a['server_cached'] = $server_cached;
		
		// TODO: less dirty way
		$a['player'] = array();
		$a['player']['exists'] = $exists;
		$a['player']['username'] = $exists ? $pi_username : $username;
		$a['player']['status'] = $status;
		if ($exists) {
			$a['player']['active'] = $pi_active;
			$a['player']['gold'] = $pi_gold;
			$a['player']['banned'] = $pi_banned;
			$a['player']['role'] = $pi_role;
			$a['player']['online'] = $online;
			$a['player']['action'] = $pi_action;
			$a['player']['lastUpdate'] = $pi_lastUpdate;
			$a['player']['lastUpdateTimestamp'] = strtotime($pi_lastUpdate);
		}
		if ($hasServer) {
			$a['server'] = array(
				'name' => $si_name,
				'ip' => $pi_serverIP,
				'port' => $pi_serverPort,
				'minimap' => 'https://api.kag2d.com/server/ip/' . $dataServer->serverStatus->serverIPv4Address . '/port/' . $dataServer->serverStatus->serverPort . '/minimap',
			);
		}
		$after = microtime(true);
		$a['query'] = number_format(( $after - $before), 4);
		
		print json_encode($a, JSON_PRETTY_PRINT);
	} else if (isset($_GET['auth'])) {
		$v_build = intval($_GET['v']);
		$success = ($v_build == $BUILD);
		$forceUpdate = !in_array($v_build, $COMPATIBILITY, true);
		$message = '';
		if (!$success && !$forceUpdate) {
			$message = 'This version is outdated! Please download the latest version here: <a href="#" onclick="gui.Shell.openExternal(\'' . $DOWNLOAD_LINK . '\');">' . $DOWNLOAD_LINK . '</a>';
		} else if (!$success && $forceUpdate) {
			$message  = 'This version is too old! Please download the latest version here: <a href="#" onclick="gui.Shell.openExternal(\'' . $DOWNLOAD_LINK . '\');">' . $DOWNLOAD_LINK . '</a>';
		}
		print json_encode(array('success' => $success, 'forceUpdate' => $forceUpdate, 'message' => $message), JSON_PRETTY_PRINT);
	} else if (isset($_GET['stats'])) {
		$res = mysql_query('SELECT DISTINCT COUNT(ip) AS `count` FROM `connections` WHERE UNIX_TIMESTAMP(`lastUpdate`) >= "' . (time()-520) . '"');
		$active = 0;
		if (mysql_num_rows($res) > 0) {
			$row = mysql_fetch_assoc($res);
			$active = $row['count'];
		}
		$res = mysql_query('SELECT username FROM `cache_players` WHERE UNIX_TIMESTAMP(`updated`) >= "' . (time()-60) . '"');
		$names = array();
		if (mysql_num_rows($res) > 0) {
			while ($row = mysql_fetch_assoc($res)) {
				if (!in_array($row['username'], $names)) {
					$names[] = $row['username'];
				}
			}
		}
		print json_encode(array('success' => true, 'stats' => array('activeUsers' => $active, 'updatedPlayers' => $names)));
	}

	mysql_close();
?>