APP_URL = 'http://84.200.150.138/kstalk/app.php';

_ = require('underscore');
fs = require('fs');
request = require('request');
uuid = require('node-uuid');
winreg = process.platform == 'win32' ? require('winreg') : null;

gui = require('nw.gui');
win = gui.Window.get();
var tray;

Utils = new function() {
	this.htmlEntities = function(str) {
		return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	};
};

Sound = {
	audio: null,
	play: function(path) {
		this.audio = new Audio(path);
		if(this.audio !== null) this.audio.pause();
		this.audio.play();
	}
};

app = new function () {
	var self = this;
	var settingsWindow, lookupWindow, addGroupWindow, renameGroupWindow, addPlayerWindow, removePlayerWindow, removeGroupWindow, changelogWindow;
	
	self.version = '1.1.0';
	self.build = 4;
	
	self.defaultOptions = {
		refreshInterval: 30,
		runAtStartup: false,
		startAsMinimized: false,
		showChangelog: true,
		showNotificationOnline: false,
		showNotificationChangeServer: false,
		playSoundOnline: true,
		flashWindowOnline: true,
		minimizeToTray: false,
		listDisplay: 'type0',
		lastChangelogViewed: '1.0.0',
		groups: []
	};
	self.options = {};
	
	self.watchlistTimer = null;
	self.authed = false;
	
	self.saveOptions = function() {
		var cache = [];
		localStorage.options = JSON.stringify(self.options, function(key, value) {
			if (typeof value === 'object' && value !== null) {
				if (cache.indexOf(value) !== -1) {
					// Circular reference found, discard key
					return;
				}
				// Store value in our collection
				cache.push(value);
			}
			return value;
		});
	};
	
	self.showChangelog = function() {
		if (changelogWindow) {
			changelogWindow.show();
			changelogWindow.focus();
		} else {
			var windowPath = 'changelog.html';
			global.options = app.options;
			changelogWindow = require('nw.gui').Window.open(windowPath, {
				position: 'center',
				width: 700,
				height: 600,
				frame: true,
				toolbar: false,
				//icon: 'app/assets/img/favicon.png',
				resizable: false
			});
			changelogWindow.on('close', function () {
				console.log("global.ret =",global.ret);
				if (global.ret && global.ret.name) {
					if (global.ret.name.length > 0) {
						self.lookup(global.ret.name);
					}
				}
				changelogWindow.close(true);
				changelogWindow = null;
			});
		}
	};
	
	self.minimizeToTray = function() {
		win.hide();
		tray = new gui.Tray({
			icon : 'assets/img/favicon.ico'
		});
		var menu = new gui.Menu();
		menu.append(new gui.MenuItem({
			label: 'Show',
			click: function() {
				win.show();
				tray.remove();
				tray = null;
			}
		}));
		menu.append(new gui.MenuItem({
			label: 'Quit',
			click: function() {
				gui.App.quit();
			}
		}));
		tray.menu = menu;
		tray.on('click', function () {
			win.show();
			tray.remove();
			tray = null;
		});
	};
	
	self.rebuildAccordion = function() {
		$('#watchlist .players').each(function() {
			$(this).html(
				$(this).find('.player').sort(function(a,b) {
					var onlineA = parseInt($(a).data('online'));
					var onlineB = parseInt($(b).data('online'));
					if (onlineA > onlineB) return -1;
					if (onlineA < onlineB) return 1;
					if (onlineA == onlineB) {
						var nameA = $(a).data('username').toUpperCase();
						var nameB = $(b).data('username').toUpperCase();
						if (nameA < nameB) return -1;
						if (nameA > nameB) return 1;
					}
					return 0;
				})
			);
		});
		try {
			$('#watchlist').sortable('refresh');
		} catch (e) {
			$('#watchlist').sortable({
				axis: 'y',
				handle: '.group-header',
				update: function(event, ui) {
					var newOrder = [];
					$('#watchlist .group').each(function() {
						newOrder.push($(this).data('id'));
					});
					var groupsTemp = new Array();
					for (var i=0; i<self.options.groups.length; i++) {
						var id = newOrder[i];
						for (var g in self.options.groups) {
							if (self.options.groups[g].id == id) {
								groupsTemp[i] = self.options.groups[g];
								break;
							}
						}
					}
					self.options.groups.length = 0;
					self.options.groups = groupsTemp.slice();
					self.saveOptions();
				}
			});
		}
		$('#watchlist .group').each(function() {
			var onlineCount = $(this).find('.player[data-online="1"]').length;
			var totalCount = $(this).find('.player').length;
			var $totalSpan = $(this).find('.group-header span.total');
			if (totalCount == 0) {
				$totalSpan.html('');
			} else {
				$totalSpan.html('(' + onlineCount + '/' + totalCount + ')');
			}
		});
		/* $('#watchlist .players').sortable({
			axis: 'y',
			//appendTo: $(this).parent(),
			connectWith: '#watchlist .players',
			opacity: 0.7,
			items: '.player'
		}); */
		$(window).trigger('resize');
		console.log('Accordion rebuilt');
	};
	
	self.addGroup = function(id, name) {
		$('#watchlist').prepend([
			'<div class="group" data-id="' + id + '" data-name="' + name + '">',
				'<div class="group-header"><span class="name">' + name + '</span> <span class="total"></span> <a class="group-options icomoon-pencil" data-dropdown="#dropdown-group-'+id+'"></a></div>',
				'<div id="dropdown-group-'+id+'" class="dropdown dropdown-notop dropdown-tip dropdown-anchor-right">',
					'<ul class="dropdown-menu">',
						'<li><a class="add-player">Add a player</a></li>',
						'<li><a class="rename-group">Rename the group</a></li>',
						'<li class="dropdown-divider"></li>',
						'<li><a class="remove-group">Delete the group</a></li>',
					'</ul>',
				'</div>',
				'<div class="players"></div>',
			'</div>',
		].join(''));
		self.rebuildAccordion();
		return true;
	};
	
	self.addPlayer = function(name, groupId) {
		name = name.trim();
		var found = false;
		for (var g in self.options.groups) {
			//if (self.options.groups[g].id == groupId) {
				for (var p in self.options.groups[g].players) {
					if (self.options.groups[g].players[p].username.toUpperCase() == name.toUpperCase()) {
						found = true;
						break;
					}
				}
			//}
			if (found) break;
		}
		if (!found) {
			for (var g in self.options.groups) {
				if (self.options.groups[g].id == groupId) {
					self.options.groups[g].players.push({ username: name });
				}
			}
		}
		
		// Add a temporary player div
		var foundHtml = false;
		$('#watchlist .players .player').each(function() {
			if ($(this).data('username').toUpperCase() == name.toUpperCase()) {
				foundHtml = true;
			}
		});
		if (!foundHtml) {
			var html = [
				'<div class="player unknown appear" data-online="-1" data-username="'+name+'">',
					'<div class="block">',
						'<div class="thumb md"><img src="assets/img/avatar_m.png" /></div>',
						'<div class="details clearfix">',
							'<div class="name"><span>'+name+'</span></div>',
							'<div class="input"><span></span></div>',
						'</div>',
						'<div class="delete">Remove</div>',
					'</div>',
				'</div>'
			].join('');
			$('#watchlist .group[data-id="' + groupId + '"] .players').append(html);
		}
		return !found;
	};
	
	self.removePlayer = function(name, groupId) {
		var removed = false;
		for (var g in self.options.groups) {
			if (self.options.groups[g].id == groupId) {
				for (var p in self.options.groups[g].players) {
					if (self.options.groups[g].players[p].username.toUpperCase() == name.toUpperCase()) {
						removed = true;
						self.options.groups[g].players.splice(p, 1);
						$('#watchlist .group[data-id="' + groupId + '"] .players .player').each(function() {
							if ($(this).data('username').toUpperCase() == name.toUpperCase()) {
								$(this).remove();
							}
						});
						self.rebuildAccordion();
						break;
					}
				}
			}
			if (removed) break;
		}
		return removed;
	};
	
	self.removeGroup = function(groupId) {
		var removed = false;
		for (var g in self.options.groups) {
			if (self.options.groups[g].id == groupId) {
				removed = true;
				self.options.groups.splice(g, 1);
				$('#watchlist .group[data-id="' + groupId + '"]').remove();
				self.rebuildAccordion();
				break;
			}
		}
		return removed;
	};
	
	self.renameGroup = function(groupId, name) {
		for (var g in self.options.groups) {
			if (self.options.groups[g].id == groupId) {
				self.options.groups[g].name = name;
				$('#watchlist .group[data-id="' + groupId + '"] span.name').html(Utils.htmlEntities(name));
				self.rebuildAccordion();
				break;
			}
		}
	};
	
	self.refresh = function() {
		console.time('self.refresh()');
		clearTimeout(self.watchlistTimer);
		jQuery.ajaxQueue.clear();
		setLoading(true);
		
		if (!self.authed) {
			console.log('Not authed! Calling app.auth()');
			self.auth(function() {
				// Success
				self.refresh();
			}, function(message) {
				// Failure
				setStatus(message);
				setLoading(false);
				clearTimeout(self.watchlistTimer);
				self.watchlistTimer = setTimeout(function() {
					self.refresh();
				}, self.options.refreshInterval*1000);
				console.timeEnd('self.refresh()');
			}, function() {
				// Error
				setStatus("Couldn't contact KStalk server!");
				setLoading(false);
				clearTimeout(self.watchlistTimer);
				self.watchlistTimer = setTimeout(function() {
					self.refresh();
				}, self.options.refreshInterval*1000);
				console.timeEnd('self.refresh()');
			});
			return;
		}
		
		var queue = [];
		for (var g in self.options.groups) {
			for (var p in self.options.groups[g].players) {
				queue.push({ username: self.options.groups[g].players[p].username, group: self.options.groups[g].id });
			}
		}
		var count = 0;
		
		if (queue.length == 0) {
			console.log('The queue is empty');
			console.log('Done refreshing');
			setLoading(false);
			clearTimeout(self.watchlistTimer);
			self.watchlistTimer = setTimeout(function() {
				self.refresh();
			}, self.options.refreshInterval*1000);
			console.timeEnd('self.refresh()');
		}
		
		for (var q in queue) {
			jQuery.ajaxQueue({
				url: APP_URL + "?watchlist&username=" + queue[q].username + "&v=" + self.build,
				dataType: "json"
			}).done(function(data) {
				if (data.error) {
					setStatus(data.error);
				} else {
					var p = data;
					p.cls = '';
					p.favorite = false;//(self.favorites.indexOf(p.player.username) > -1);
					
					var found = false;
					for (var g in self.options.groups) {
						for (var pl in self.options.groups[g].players) {
							if (self.options.groups[g].players[pl].username.toUpperCase() == p.player.username.toUpperCase()) {
								groupId = self.options.groups[g].id;
								oldPlayer = self.options.groups[g].players[pl];
								found = true;
								break;
							}
						}
						if (found) break;
					}
					if (!found) {
						console.log('WTF? Couldnt find player ' + p.player.username + ', not in a group');
					} else {
						if (p.player.exists) {	
							if (p.player.role == 1) p.cls += ' dev';
							else if (p.player.role == 2) p.cls += ' guard';
							else if (p.player.gold == true) p.cls += ' gold';
							else if (p.player.banned == true) p.cls += ' banned';
							
							if (p.player.online == true) p.cls += ' online';
							else p.cls += ' offline';
						}
						
						var html = [
							'<div class="player'+p.cls+' appear" data-online="'+(p.player.online?'1':'0')+'" data-ip="'+(p.server ? p.server.ip : '')+'" data-port="'+(p.server ? p.server.port : '')+'" data-username="'+p.player.username+'">',
								'<div class="block">',
									'<div class="version' + (p.favorite ? ' enabled' : '') + '"></div>',
									//'<div class="author"><span></span></div>',
									'<div class="thumb md"><img src="'+(p.avatar == null ? 'assets/img/avatar_m.png' : p.avatar.medium)+'" /></div>',
									'<div class="details clearfix">',
										'<div class="name"><span>'+p.player.username+'</span></div>',
										'<div class="input"><span>'+p.player.status+'</span></div>',
									'</div>',
									'<div class="delete">Remove</div>',
								'</div>',
							'</div>'
						].join('');
						
						var $divPlayer = [];
						$('#watchlist .group .players .player').each(function() {
							if ($(this).data('username').toUpperCase() == p.player.username.toUpperCase()) {
								$divPlayer = $(this);
							}
						});
						
						if ($divPlayer.length > 0) {
							// Exists
							
							// Show a notification if was offline and now online
							if (!$divPlayer.hasClass('unknown') && (($divPlayer.data('online') == '0' && p.player.online) || (self.options.showNotificationChangeServer && p.player.online && p.server && ($divPlayer.data('ip') != p.server.ip && $divPlayer.data('port') != p.server.port)))) {
								if (self.options.showNotificationOnline) {
									var icon = 'desktop-notify.png';
									var title = p.player.username + ' is now playing!';
									var content = '<a href="kag://' + p.server.ip + ':' + p.server.port + '">' + p.server.name + '</a>';
									window.LOCAL_NW.desktopNotifications.notify(icon, title, content, function () {
										//process.exec('kag://' + p.server.ip + ':' + p.server.port);
									});
								}
								if (self.options.playSoundOnline) {
									Sound.play('notify.ogg');
								}
								if (self.options.flashWindowOnline) {
									gui.Window.get().requestAttention(true);
								}
							}
							
							// Update the DOM
							$divPlayer.replaceWith(html);
						} else {
							// Add
							$('#watchlist .group[data-id="' + groupId + '"] .players').append(html);
						}
						self.rebuildAccordion();
					}
				}
				
				// Finalize
				count++;
				console.log(count + '/' + queue.length);
				if (count >= queue.length) {
					console.log('Done refreshing');
					//setStatus('Loading completed!');
					setLoading(false);
					clearTimeout(self.watchlistTimer);
					self.watchlistTimer = setTimeout(function() {
						self.refresh();
					}, self.options.refreshInterval*1000);
					console.timeEnd('self.refresh()');
				} else {
					//setStatus('Loaded ' + count + '/' + queue.length + '...');
					console.log('Loaded ' + count + '/' + queue.length + '...');
				}
			}).fail(function() {
				console.log("FAIL!", arguments);
				count++;
				
				console.log(count + '/' + queue.length);
				if (count >= queue.length) {
					console.log('Done refreshing');
					//setStatus('Loading completed!');
					setLoading(false);
					clearTimeout(self.watchlistTimer);
					self.watchlistTimer = setTimeout(function() {
						self.refresh();
					}, self.options.refreshInterval*1000);
					console.timeEnd('self.refresh()');
				} else {
					setStatus('Failed loading ' + count + '/' + queue.length + '...');
				}
			});
		}
	};
	
	self.lookup = function(username) {
		console.time('self.lookup()');
		setLoading(true);
		
		if (!self.authed) {
			console.log('Not authed! Calling app.auth()');
			self.auth(function() {
				// Success
				self.refresh();
			}, function(message) {
				// Failure
				setStatus(message);
				setLoading(false);
				console.timeEnd('self.lookup()');
			}, function() {
				// Error
				setStatus("Couldn't contact KStalk server!");
				setLoading(false);
				console.timeEnd('self.lookup()');
			});
			return;
		}
		
		jQuery.ajax({
			url: APP_URL + "?watchlist&username=" + username + "&v=" + self.build,
			dataType: "json"
		}).done(function(data) {
			if (data.error) {
				setStatus(data.error);
			} else {
				var p = data;
				p.cls = '';
				p.favorite = false;//(self.favorites.indexOf(p.player.username) > -1);
				
				if (p.player.exists) {	
					if (p.player.role == 1) p.cls += ' dev';
					else if (p.player.role == 2) p.cls += ' guard';
					else if (p.player.gold == true) p.cls += ' gold';
					else if (p.player.banned == true) p.cls += ' banned';
					
					if (p.player.online == true) p.cls += ' online';
					else p.cls += ' offline';
				}
				
				var html = [
					'<div class="player'+p.cls+' appear" data-online="'+(p.player.online?'1':'0')+'" data-username="'+p.player.username+'">',
						'<div class="block">',
							'<div class="version' + (p.favorite ? ' enabled' : '') + '"></div>',
							'<div class="thumb md"><img src="'+(p.avatar == null ? 'assets/img/avatar_m.png' : p.avatar.medium)+'" /></div>',
							'<div class="details clearfix">',
								'<div class="name"><span>'+p.player.username+'</span></div>',
								'<div class="input"><span>'+p.player.status+'</span></div>',
							'</div>',
							(typeof(p.server) != 'undefined' && typeof(p.server.minimap) != 'undefined' ? '<div class="minimap"><img src="'+p.server.minimap+'" /></div>' : ''),
						'</div>',
					'</div>'
				].join('');
				
				var $divLookup = $('#lookup');
				if ($divLookup.length == 0) {
					$('#content').append('<div class="lookup-shadow"></div><div id="lookup"><div class="lookup-close icomoon-close"></div><div class="lookup-inner"></div></div>');
				}
				$('#lookup .lookup-inner').html(html);
				$('#lookup').css({left: '-100%', opacity: 0});
				
				$("#lookup .player .name").textAutoSize({
					mode: 'rec-binary'
				});
				
				setTimeout(function() {
					$('.lookup-shadow').animate({opacity: 1});
					$('#lookup').css({left: 0, opacity: 1});
				},400);
			}
			
			// Finalize
			console.log('Lookup done!');
			setLoading(false);
			console.timeEnd('self.lookup()');
		}).fail(function() {
			console.log("FAIL!", arguments);
			
			console.log('Lookup done!');
			setLoading(false);
			console.timeEnd('self.lookup()');
			setStatus('Lookup failed');
		});
	};
	
	self.init = function () {
		console.log("[App] Init");
		
		if (typeof(localStorage.options) != "undefined") {
			var data = $.parseJSON(localStorage.options);
			self.options = _.defaults(data, self.defaultOptions);
			
			for (var g in self.options.groups) {
				self.addGroup(self.options.groups[g].id, self.options.groups[g].name);
				for (var p in self.options.groups[g].players) {
					self.addPlayer(self.options.groups[g].players[p].username, self.options.groups[g].id);
				}
			}
			$('#watchlist').addClass(self.options.listDisplay);
		} else {
			// localStorage options is empty, save the default settings
			self.options = _.clone(self.defaultOptions);
			self.saveOptions();
		}
		
		win.on('minimize', function () {
			if (self.options.minimizeToTray) {
				self.minimizeToTray();
			}
		});
		
		if (self.options.startAsMinimized && self.options.minimizeToTray) {
			self.minimizeToTray();
		} else {
			win.show();
			if (self.options.startAsMinimized) {
				win.minimize();
			}
		}
		
		$(document).keydown(function (e) {
			if (e.which == 123) { // F12
				e.preventDefault();
				gui.Window.get().showDevTools();
				return true;
			}
		});
		$(".controls .watchlist").click(function () {
			//self.page('watchlist.html');
		});
		$(".controls .options").click(function () {
			//self.page('options.html');
		});
		$(".controls .minimize").click(function () {
			win.minimize();
		});
		$(".controls .close").click(function () {
			win.close();
		});
		
		if (self.options.lastChangelogViewed != self.version) {
			self.showChangelog();
			self.options.lastChangelogViewed = self.version;
			self.saveOptions();
		}
		
		////////////
		// Events //
		////////////
		$(window).focus(function() {
			gui.Window.get().requestAttention(false);
		});
		$(window).resize(function() {
			$('#content').height($('#container').height()-$('#header').height());
			if ($('#lookup').length > 0) {
				$("#lookup .player .name").textAutoSize({
					mode: 'rec-binary'
				});
			}
		});
		
		$('#content').scroll(function() {
			if ($('#content').scrollTop() >= 10 && $('#mod_options').css('opacity') == '1') {
				$('#mod_options').stop().animate({opacity: 0.8});
			} else if ($('#content').scrollTop() < 10 && $('#mod_options').css('opacity') != '1') {
				$('#mod_options').stop().animate({opacity: 1});
			}
		});
		$('.controls a.add-group').click(function() {
			if (addGroupWindow) {
				addGroupWindow.show();
				addGroupWindow.focus();
			} else {
				var windowPath = 'addGroup.html';
				global.options = app.options;
				addGroupWindow = require('nw.gui').Window.open(windowPath, {
					position: 'center',
					width: 215,
					height: 120,
					frame: true,
					toolbar: false,
					//icon: 'app/assets/img/favicon.png',
					resizable: false
				});
				addGroupWindow.on('close', function () {
					console.log("global.ret =",global.ret);
					if (global.ret && global.ret.name) {
						if (global.ret.name.length > 0) {
							var name = global.ret.name;
							var gid = uuid.v4();
							if (self.addGroup(gid, name)) {
								setStatus('Added a new group : ' + name);
								self.options.groups.splice(0, 0, {id: gid, name: name, players: []});
								self.saveOptions();
							}
						}
					}
					addGroupWindow.close(true);
					addGroupWindow = null;
				});
			}
		});
		$('.controls a.change-type').click(function() {
			var type = $(this).data('type');
			var $watchlist = $('#watchlist');
			// TODO: better management
			$watchlist.removeClass('type0 type1 type2').addClass(type);
			self.options.listDisplay = type;
			self.saveOptions();
		});
		$('.controls a.settings').click(function() {
			if (settingsWindow) {
				settingsWindow.show();
				settingsWindow.focus();
			} else {
				var windowPath = 'options.html';
				global.ret = app.options;
				settingsWindow = require('nw.gui').Window.open(windowPath, {
					position: 'center',
					width: 700,
					height: 600,
					frame: true,
					toolbar: false,
					icon: 'app/assets/img/icons/128.png',
					resizable: true
				});
				settingsWindow.on('close', function () {
					if (global.ret) {
						console.log("global.ret=",global.ret);
						
						// "Run at startup" option
						if (process.platform == 'win32') {
							var regKey = new winreg({
								hive: winreg.HKCU, // HKEY_CURRENT_USER
								key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
							})
							if (global.ret.runAtStartup) {
								regKey.get('KStalk', function(err) {
									if (err) {
										// Key doesn't exist yet
										regKey.set('KStalk', 'REG_SZ', '"' + process.execPath + '"', function(err) {
											if (err) global.ret.runAtStartup = false;
										});
									}
								});
							} else {
								regKey.get('KStalk', function(err) {
									if (!err) {
										// Key exists
										regKey.remove('KStalk', function() {
											if (err) {
												// Could not remove the key, notify the user
												alert("Could not remove KStalk from the startup programs. Please report this issue to the developer. In the meantime, you can manually remove via the Task Manager (Windows 8) or by running msconfig (Windows XP/7). Thanks for your understanding.");
												global.ret.runAtStartup = true;
											}
										});
									}
								});
							}
						}
						
						// Overwrite current options and save
						app.options = _.defaults(global.ret, app.options);
						app.saveOptions();
					}
					if (settingsWindow) settingsWindow.close(true);
					settingsWindow = null;
				});
			}
		});
		$('.controls a.lookup').click(function() {
			if (lookupWindow) {
				lookupWindow.show();
				lookupWindow.focus();
			} else {
				var windowPath = 'lookup.html';
				global.options = app.options;
				lookupWindow = require('nw.gui').Window.open(windowPath, {
					position: 'center',
					width: 215,
					height: 120,
					frame: true,
					toolbar: false,
					//icon: 'app/assets/img/favicon.png',
					resizable: false
				});
				lookupWindow.on('close', function () {
					console.log("global.ret =",global.ret);
					if (global.ret && global.ret.name) {
						if (global.ret.name.length > 0) {
							self.lookup(global.ret.name);
						}
					}
					lookupWindow.close(true);
					lookupWindow = null;
				});
			}
		});
		
		$(document).on('click', '.group .remove-group', function(e) {
			var groupId = $(this).parents('.group').data('id');
			var groupName = $(this).parents('.group').data('name');
			if (removeGroupWindow) {
				removeGroupWindow.show();
				removeGroupWindow.focus();
			} else {
				var windowPath = 'removeGroup.html';
				global.options = app.options;
				global.windowArgs = { username: name, groupName: groupName };
				removeGroupWindow = require('nw.gui').Window.open(windowPath, {
					position: 'center',
					width: 400,
					height: 120,
					frame: true,
					toolbar: false,
					//icon: 'app/assets/img/favicon.png',
					resizable: false
				});
				removeGroupWindow.on('close', function () {
					console.log("global.ret =",global.ret);
					if (global.ret && global.ret.choice) {
						if (global.ret.choice == 'yes') {
							console.log(groupId,groupName);
							if (self.removeGroup(groupId)) {
								setStatus('Removed ' + groupName + ' from the list');
								self.saveOptions();
							}
						}
					}
					removeGroupWindow.close(true);
					removeGroupWindow = null;
				});
			}
		});
		$(document).on('click', '.group .rename-group', function(e) {
			var groupId = $(this).parents('.group').data('id');
			var groupName = $(this).parents('.group').data('name');
			if (renameGroupWindow) {
				renameGroupWindow.show();
				renameGroupWindow.focus();
			} else {
				var windowPath = 'renameGroup.html';
				global.options = app.options;
				global.ret = { name: groupName };
				renameGroupWindow = require('nw.gui').Window.open(windowPath, {
					position: 'center',
					width: 215,
					height: 120,
					frame: true,
					toolbar: false,
					//icon: 'app/assets/img/favicon.png',
					resizable: false
				});
				renameGroupWindow.on('close', function () {
					console.log("global.ret =",global.ret);
					if (global.ret && global.ret.name) {
						if (global.ret.name.length > 0) {
							console.log(groupId,groupName);
							self.renameGroup(groupId, global.ret.name);
							self.saveOptions();
						}
					}
					renameGroupWindow.close(true);
					renameGroupWindow = null;
				});
			}
		});
		$(document).on('click', '.group .add-player', function(e) {
			var groupId = $(this).parents('.group').data('id');
			var groupName = $(this).parents('.group').data('name');
			if (addPlayerWindow) {
				addPlayerWindow.show();
				addPlayerWindow.focus();
			} else {
				var windowPath = 'addPlayer.html';
				global.options = app.options;
				addPlayerWindow = require('nw.gui').Window.open(windowPath, {
					position: 'center',
					width: 215,
					height: 130,
					frame: true,
					toolbar: false,
					//icon: 'app/assets/img/favicon.png',
					resizable: false
				});
				addPlayerWindow.on('close', function () {
					console.log("global.ret =",global.ret);
					if (global.ret && global.ret.name) {
						if (global.ret.name.length > 0) {
							console.log(typeof(global.ret.name));
							if (typeof(global.ret.name) == 'string') {
								var name = global.ret.name;
								if (self.addPlayer(name, groupId)) {
									setStatus('Added ' + name + ' to the group ' + groupName);
									self.saveOptions();
									self.refresh();
								} else {
									setStatus('This player is already in a group');
								}
							} else if (typeof(global.ret.name) == 'object') {
								var added = [];
								for (var i=0; i<global.ret.name.length; i++) {
									var name = global.ret.name[i];
									if (self.addPlayer(name, groupId)) {
										added.push(name);
									} else {
										//setStatus('This player is already in a group');
									}
								}
								self.saveOptions();
								self.refresh();
								setStatus('Added ' + added.join(', ') + ' to the group ' + groupName);
							}
						}
					}
					addPlayerWindow.close(true);
					addPlayerWindow = null;
				});
			}
		});
		$(document).on('click', '.group .group-header', function(e) {
			var $group = $(this).parent();
			if ($group.hasClass('collapsed')) {
				$group.removeClass('collapsed');
			} else {
				$group.addClass('collapsed');
			}
		});
		$(document).on('click', '.player .delete', function(e) {
			e.stopPropagation();
			var name = $(this).parents('.player').data('username');
			var groupId = $(this).parents('.group').data('id');
			var groupName = $(this).parents('.group').data('name');
			
			if (removePlayerWindow) {
				removePlayerWindow.show();
				removePlayerWindow.focus();
			} else {
				var windowPath = 'removePlayer.html';
				global.options = app.options;
				global.windowArgs = { username: name, groupName: groupName };
				removePlayerWindow = require('nw.gui').Window.open(windowPath, {
					position: 'center',
					width: 400,
					height: 120,
					frame: true,
					toolbar: false,
					//icon: 'app/assets/img/favicon.png',
					resizable: false
				});
				removePlayerWindow.on('close', function () {
					console.log("global.ret =",global.ret);
					if (global.ret && global.ret.choice) {
						if (global.ret.choice == 'yes') {
							if (self.removePlayer(name, groupId)) {
								setStatus('Removed ' + name + ' from ' + groupName);
								self.saveOptions();
							}
						}
					}
					removePlayerWindow.close(true);
					removePlayerWindow = null;
				});
			}
		});
		$(document).on('click', '#watchlist .player .thumb, #watchlist .player .name', function() {
			var name = $(this).parents('.player').data('username');
			self.lookup(name);
		});
		$(document).on('click', '.lookup-close', function() {
			$('#lookup').css({left: '-100%', opacity: 0});
			setTimeout(function() {
				$('#lookup').remove();
				$('.lookup-shadow').stop().fadeOut(function() {
					$(this).remove();
				});
			},400);
		});
		/* $(document).on('click', '.player .version', function() {
			var name = $(this).parents('.player').data('username');
			favoritePlayer(name);
			sortWatchlist();
		}); */
		
		self.refresh();
	};
	
	self.auth = function(cbSuccess, cbFailure, cbError) {
		request(APP_URL + '?auth&v='+self.build, function(error, response, body) {
			if (error != null) {
				if (typeof(cbError) == 'function') cbError();
				return;
			}
			try {
				var data = JSON.parse(body);
				self.authed = true;
				if (data.success) {
					if (typeof(cbSuccess) == 'function') cbSuccess();
				} else {
					if (data.forceUpdate) {
						alert(data.message);
						process.exit(0);
						return;
					} else {
						if (typeof(cbFailure) == 'function') cbFailure(data.message);
					}
				}
			} catch (e) {
				if (typeof(cbError) == 'function') cbError();
			}
		});
	};
	
	// Init
	$(document).ready(function() {
		if (process.platform == 'win32') {
			var regKey = new winreg({
				hive: winreg.HKCU, // HKEY_CURRENT_USER
				key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
			})
			regKey.values(function (err, items) {
				if (err) {
					console.log('ERROR: '+err);
				} else {
					for (var i in items) {
						if (items[i].value == '"' + process.execPath + '"') {
							self.options.runAtStartup = true;
							break;
						}
					}
				}
			});
		}
		/*$('#content .loading').fadeIn();
		self.auth(function() {
			// Success
			setTimeout(function() {
				$('#content .loading').stop().fadeOut(function() {
					self.init();
				});
			}, 1000);
		}, function(message) {
			// Failure
			setStatus(message);
			setTimeout(function() {
				$('#content .loading').stop().fadeOut(function() {
					self.init();
				});
			}, 1000);
		}, function() {
			// Error
			setStatus("Couldn't contact KStalk server!");
			setTimeout(function() {
				$('#content .loading').stop().fadeOut(function() {
					self.init();
				});
			}, 1000);
		});*/
		$('#content .loading').hide();
		self.init();
	});
}

var statusBarTimer = null;
function setStatus(s) {
	clearTimeout(statusBarTimer);
	$('#footer').css('opacity', '0').css('bottom', '-50px').css('opacity', '1').css('bottom', '0');
	$('.status-bar').html('<span class="icon icomoon-pacman"></span><span class="text">' + s + '</span>');
	statusBarTimer = setTimeout(function() {
		$('#footer').css('bottom', '-50px');
	}, 5000);
}
function setLoading(b) {
	if (b) $('.title-bar .loading').fadeIn('fast');
	else $('.title-bar .loading').fadeOut('fast');
}
