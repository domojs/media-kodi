var bonjour = require( 'bonjour' )();
var debug = $( 'debug' )( 'domojs:media-kodi' );

bonjour.find( { type: 'xbmc-jsonrpc' }, function( kodiService ) {
    var JsonRpcWs = require( 'json-rpc-ws' );
    var kodi = JsonRpcWs.createClient();

    kodi.connect( 'ws://' + kodiService.referer.address + ':' + kodiService.port + '/jsonrpc', function connected() {
        debug( 'connected to ' + kodiService.name );

        kodi.send( 'JSONRPC.Introspect', [], function( error, reply ) {
            if( error )
                debug( error );
            else {
                $.each( reply.methods, function( i, m ) {
                    var ns = i.split( '.' );
                    if( typeof ( kodi[ ns[ 0 ] ] ) == 'undefined' )
                        kodi[ ns[ 0 ] ] = {};
                    kodi[ ns[ 0 ] ][ ns[ 1 ] ] = function( params, callback ) {
                        if( !kodi.isConnected() )
                        {
                            socket.emit('iamnotaplayer');
                            callback( new Error( 'Not connected' ) );
                            return;
                        }
                        if( typeof ( callback ) == 'undefined' && typeof ( params ) == 'function' ) {
                            callback = params;
                            params = {};
                        }
                        $.each( m.params, function( i, value ) {
                            if( value.required && typeof ( params[ value.name ] ) == 'undefined' ) {
                                throw JSON.stringify( params ) + ' is missing the required param ' + value.name + ' for ' + ns[ 1 ];
                            }
                        });
                        debug( 'calling ' + i, JSON.stringify( params ) );
                        if( typeof ( callback ) == 'undefined' )
                            kodi.send( i, params, $.noop );
                        else
                            kodi.send( i, params, callback );
                    }
                })
                $.each( reply.notifications, function( i, m ) {
                    var ns = i.split( '.' );
                    if( typeof ( kodi[ ns[ 0 ] ] ) == 'undefined' )
                        kodi[ ns[ 0 ] ] = {};
                    kodi[ ns[ 0 ] ][ ns[ 1 ] ] = function( callback ) {
                        if( typeof ( callback ) == 'undefined' ) {
                            throw 'callback is missing for ' + ns[ 1 ];
                        }
                        debug( 'monitoring ' + i, JSON.stringify( i ) );
                        kodi.expose( i, callback );
                    }
                })
                debug( 'kodi client built' );

                var identity = { id: kodiService.id };
                var playlistId = 'media:playlist:' + identity.id;
                var mrl;
                var markedAsRead = false;
                var device = false;
                //player discovery
                var socket = require( 'socket.io-client' )( 'https://home.dragon-angel.fr' );
                var joined = false;
                var n = 0;
                socket.on( 'connect', function() {
                    if( !joined )
                        socket.emit( 'join', 'iamaplayer', function() {
                            debug( 'server started' );
                        });
                    else
                        debug( 'already joined' );
                });

                debug( 'registering on whoisaplayer' );
                socket.on( 'whoisaplayer', function( message ) {
                    debug( message );
                    debug( 'identity requested' + ( ++n ) );
                    socket.emit( 'iamaplayer', { replyTo: message.replyTo, identity: kodiService.name });
                });

                socket.emit( 'iamaplayer', { identity: kodiService.name });

                socket.on( 'player.command', function( command ) {
                    if( typeof ( command ) == 'string' )
                        command = { name: command };
                    if( typeof ( commands[ command.name ] ) != 'undefined' ) {
                        commands[ command.name ].apply( commands, command.args );
                    }
                });

                var timer = false;
                function startTimer() {
                    if( timer )
                        return;
                    timer = setInterval( function() {
                        commands.status();
                    }, 1000 )
                }

                function stopTimer() {
                    clearInterval( timer );
                    timer = false;
                }

                var commands = {
                    play: function( media ) {
                        debug( media );
                        if( typeof ( media ) != 'undefined' ) {
                            if( !media || isNaN( Number( media.path ) ) ) {
                                media.path = decodeURIComponent( media.path );
                                media.path = media.path.replace( /file:\/\/\/\/\//, 'smb://' );
                                debug( media );
                                kodi.Playlist.GetPlaylists( function( err, result ) {
                                    if( err )
                                        debug( err );
                                    else {
                                        debug( result );
                                        var mediaType = media.id.substring( 'media:'.length, media.id.indexOf( ':', 'media:'.length ) );
                                        debug( mediaType );
                                        if( result && result.items ) {
                                            var playlist = $.grep( result.items, function( e ) {
                                                return e.type == mediaType;
                                            })[ 0 ];
                                            if( !err && typeof ( playlist ) != 'undefined' ) {
                                                kodi.Playlist.Add( { playlistid: playlist.playlistid, item: { file: media.path } }, function() {
                                                    startTimer();
                                                })
                                            }
                                        }
                                        else {
                                            kodi.Player.Open( { item: { file: media.path } }, function() {
                                                startTimer();
                                            });
                                        }
                                    }
                                });
                            }
                            else {
                                var self = this;
                                getJSON( 'http://:azerty@localhost:8080/requests/playlist.json', function( status, playlist ) {
                                    self.status( 'pl_play&id=' + playlist.children[ 0 ].children[ Number( media ) ].id );
                                });
                            }
                        }
                        else
                            this.pause();
                    },
                    enqueue: function( media ) {
                        this.play( media );
                    },
                    pause: function() {
                        kodi.Player.GetActivePlayers( function( err, players ) {
                            if( players.length > 0 ) {
                                debug( players );
                                kodi.Player.PlayPause( { playerid: players[ 0 ].playerid }, function( err, status ) {
                                    if( status.speed )
                                        startTimer();
                                    else
                                        stopTimer();
                                })
                            }
                        })
                    },
                    stop: function() {
                        kodi.Player.GetActivePlayers( function( err, players ) {
                            if( players.length > 0 ) {
                                debug( players );
                                kodi.Player.Stop( { playerid: players[ 0 ].playerid }, function() {
                                    stopTimer();
                                })
                            }
                        })
                    },
                    next: function() {
                        kodi.Player.GetActivePlayers( function( err, players ) {
                            if( players.length > 0 ) {
                                debug( players );
                                kodi.Player.GoNext( { playerid: players[ 0 ].playerid })
                            }
                        })
                    },
                    previous: function() {
                        kodi.Player.GetActivePlayers( function( err, players ) {
                            if( players.length > 0 ) {
                                debug( players );
                                kodi.Player.GoPrevious( { playerid: players[ 0 ].playerid })
                            }
                        })
                    },
                    remove: function( id ) {
                        var self = this;
                        getJSON( 'http://:azerty@localhost:8080/requests/playlist.json', function( status, playlist ) {
                            self.status( 'pl_delete&id=' + playlist.children[ 0 ].children[ Number( id ) ].id );
                        });
                    },
                    loop: function() {
                        this.repeat();
                    },
                    repeat: function() {
                        return false;
                        kodi.Player.GetActivePlayers( function( err, players ) {
                            if( players.length > 0 )
                                debug( players );
                            //kodi.Player.Repeat( players[ 0 ].playerid,  )
                        })
                    },
                    volume: function( val ) {
                        kodi.Application.SetVolume( val );
                    },
                    seek: function( val ) {
                        this.status( 'seek&val=' + val );
                    },
                    fullscreen: function() {
                    },
                    status: function( param ) {
                        kodi.Player.GetActivePlayers( function( err, players ) {
                            if( players.length > 0 ) {
                                debug( players );
                                kodi.Player.GetProperties( { playerid: players[ 0 ].playerid, properties: [ 'position', 'percentage', 'repeat', 'canseek', 'time', 'totaltime', 'speed' ] }, function( err, player ) {
                                    debug( player );
                                    socket.emit( 'player.status', {
                                        state: player.speed ? 'playing' : 'paused',
                                        position: player.percentage / 100,
                                        time: player.time.seconds + 60 * player.time.minutes + 3600 * player.time.hours,
                                        length: player.totaltime.seconds + 60 * player.totaltime.minutes + 3600 * player.totaltime.hours,
                                    });
                                });
                            }
                            else {
                                socket.emit( 'player.status', { state: 'stopped' });
                                if( timer )
                                    stopTimer();
                            }

                        });
                    },
                    playlist: function() {
                        kodi.Player.GetActivePlayers( function( err, players ) {
                            if( players.length > 0 ) {
                                debug( players );
                                kodi.Player.GetProperties( { playerid: players[ 0 ].playerid, properties: [ 'playlistid', 'speed' ] }, function( err, properties ) {
                                    if( !err && typeof ( properties.playlistid ) != 'undefined' ) {
                                        kodi.Player.GetItem( { playerid: players[ 0 ].playerid, properties: [ 'title', 'artist', 'albumartist', 'fanart', 'plot', 'season', 'episode', 'thumbnail', 'file', 'art' ] }, function( err, item ) {
                                            $.extend( item.item, { current: 'current' });
                                            if( err )
                                                debug( err );
                                            kodi.Playlist.GetItems( { playlistid: properties.playlistid, properties: [ 'title', 'artist', 'albumartist', 'fanart', 'plot', 'season', 'episode', 'thumbnail', 'file', 'art' ] }, function( err, playlist ) {
                                                debug( playlist );
                                                if( playlist && !playlist.items )
                                                    playlist.items = [ item.item ]
                                                else
                                                    playlist.items.unshift( item.item );
                                                debug( playlist.items );
                                                if( properties.speed > 0 )
                                                    startTimer();
                                                if( playlist && playlist.items )
                                                    socket.emit( 'player.playlist', $.map( playlist.items, function( media ) {
                                                        return { uri: media.file.replace( /smb:\/\//, 'file://///' ), current: media.current };
                                                    }) );
                                            })
                                        })
                                    }
                                });
                            }
                        });
                    },
                    art: function() {
                        return false;
                        require( 'http' ).get( 'http://:azerty@localhost:8080/art', function( res ) {
                            var chunks = []
                            if( res.statusCode == 200 ) {
                                res.on( 'data', function( chunk ) {
                                    chunks.push( chunk );
                                });
                                res.on( 'end', function( chunk ) {
                                    if( chunk )
                                        chunks.push( chunk );
                                    socket.emit( 'player.art', Buffer.concat( chunks ) );
                                });
                            }
                            else
                                socket.emit( 'player.art', new Buffer( 0 ) );
                        });
                    },
                    quit: function() {
                        // process.exit();
                    },
                    shutdown: function() {
                        // require( 'child_process' ).exec( 'shutdown -s', debug );
                    },
                }
                kodi.JSONRPC.SetConfiguration( { notifications: { gui: false, system: true, player: true, audiolibrary: false, other: false, videolibrary: false } }, function() {
                    kodi.Player.OnPause( function() {
                        debug( 'OnPause' )
                        commands.status();
                        stopTimer();
                    });
                    kodi.Player.OnPlay( function() {
                        debug( 'OnPlay' )
                        commands.status();
                        commands.playlist();
                        startTimer();
                    });
                    kodi.Player.OnSeek( function() {
                        debug( 'OnSeek' )
                        commands.status();
                    });
                    kodi.Player.OnPropertyChanged( function() {
                        debug( 'OnPropertyChanged' )
                        commands.status();
                    });
                    kodi.Player.OnStop( function() {
                        debug( 'OnStop' )
                        commands.status();
                        stopTimer();
                    });
                });
            }
        });
    });
})
