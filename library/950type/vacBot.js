'use strict';

const VacBotCommand = require('./command');
const VacBot = require('../vacBot');
const tools = require('../tools');
const mapTools = require('../mapTools');
const map = require('../mapTemplate');
const dictionary = require('./dictionary');
const {errorCodes} = require('../errorCodes.json');

/**
 * This class is relevant for 950 type models
 * e.g. Deebot OZMO 920/950, T8 series, T9 series (which are all MQTT based models)
 */
class VacBot_950type extends VacBot {
    /**
     * @param {string} user - the userId retrieved by the Ecovacs API
     * @param {string} hostname - the hostname of the API endpoint
     * @param {string} resource - the resource of the vacuum
     * @param {string} secret - the user access token
     * @param {Object} vacuum - the device object for the vacuum
     * @param {string} continent - the continent where the Ecovacs account is registered
     * @param {string} [country='DE'] - the country where the Ecovacs account is registered
     * @param {string} [serverAddress] - the server address of the MQTT server
     */
    constructor(user, hostname, resource, secret, vacuum, continent, country, serverAddress = '', authDomain = '') {
        super(user, hostname, resource, secret, vacuum, continent, country, serverAddress, authDomain);

        this.breakPoint = null;
        this.block = null;
        this.autoEmpty = null;
        this.autoEmptyStatus = null;
        this.advancedMode = null;
        this.trueDetect = null;
        this.cleanCount = 1;
        this.dusterRemind = {
            'enabled': null,
            'period': null
        };
        this.carpetPressure = null;
        this.cleanPreference = null;
        this.liveLaunchPwdState = {
            'state': null,
            'hasPwd': null
        };
        this.volume = 0;
        this.relocationState = null;
        this.firmwareVersion = null;
        this.airDryingStatus = null;
        this.sweepMode = null;
        this.borderSpin = null;

        // Air Purifier
        this.airQuality = {
            'particulateMatter25': null,
            'pm_10': null,
            'particulateMatter10': null,
            'airQualityIndex': null,
            'volatileOrganicCompounds': null,
            'temperature': null,
            'humidity': null
        };

        this.mic = null;
        this.humanoidFollow = null;
        this.angleFollow = null;
        this.aiBlockPlate = null;
        this.autonomousClean = null;
        this.bluetoothSpeaker = {
            'enabled': null,
            'timeout': null,
            'name': null
        };
        this.childLock = null;
        this.drivingWheel = null;
        this.monitorAirState = null;
        this.angleWakeup = null;
        this.efficiency = null;
        this.atmoLightIntensity = null;
        this.humanoidFollow = {
            'video': null,
            'yiko': null
        };
        this.sysinfo = {
            'load': null,
            'uptime': null,
            'signal': null,
            'meminfo': null,
            'pos': null
        };
        this.blockTime = {
            'from': null,
            'to': null
        };
        this.humidification = {
            'enabled': null,
            'level': null
        };
        this.airFreshening = {
            'enabled': null,
            'level': null,
            'error': null
        };
        this.uvAirCleaning = {
            'enabled': null
        };
        this.areaPoint = {
            'mapId': null,
            'locationPoints': null
        };
        this.airbotAutoModel = {
            'enable': null,
            'trigger': null,
            'aq': {
                'aqStart': null,
                'aqEnd': null
            }
        };
        this.currentTask = {
            'type': null,
            'triggerType': null,
            'failed': null
        };
        this.obstacleTypes = null;
        this.avoidedObstacles = null;
        this.OTA = {
            'status': null,
            'result': null,
            'isForce': null,
            'progress': null,
            'supportAuto': null,
            'ver': null
        };
        this.timezone = null;
        this.dmodule = {
            'enabled': null,
            'status': null
        };
    }

    /**
     * Handle the payload of the `CleanInfo` response/message
     * (e.g. charge status, clean status and the last area values)
     * @param {Object} payload
     */
    handleCleanInfo(payload) {
        this.currentSpotAreas = '';
        this.currentCustomAreaValues = '';
        if (payload['state'] === 'clean') {
            let type = payload['cleanState']['type'];
            const content = payload['cleanState']['content'];
            if (typeof content === 'object') {
                type = content['type'];
            }
            if (payload['cleanState']['motionState'] === 'working') {
                this.cleanReport = dictionary.CLEAN_MODE_FROM_ECOVACS[type];
            } else {
                this.cleanReport = dictionary.CLEAN_MODE_FROM_ECOVACS[payload['cleanState']['motionState']];
            }
            if ((type === 'spotArea') || (type === 'customArea')) {
                let areaValues;
                if (typeof content === `object`) {
                    areaValues = content['value'];
                } else {
                    areaValues = content;
                }
                if (type === 'customArea') {
                    if (typeof content === 'object') {
                        const doNotClean = content['donotClean'];
                        if ((doNotClean === 1) || (areaValues.split(',').length === 2)) {
                            // Controlled via Video Manager
                            this.cleanReport = 'setLocation';
                        }
                    }
                    this.currentCustomAreaValues = areaValues;
                } else if (type === 'spotArea') {
                    this.currentSpotAreas = areaValues;
                }
            }
        } else if (payload['trigger'] === 'alert') {
            this.cleanReport = 'alert';
        } else {
            this.cleanReport = dictionary.CLEAN_MODE_FROM_ECOVACS[payload['state']];
            if (dictionary.CLEAN_MODE_FROM_ECOVACS[payload['state']] === 'returning') {
                // set charge state on returning to dock
                const chargeStatus = dictionary.CLEAN_MODE_FROM_ECOVACS[payload['state']];
                if (chargeStatus) {
                    this.chargeStatus = chargeStatus;
                    tools.envLogResult(`chargeStatus = ${this.chargeStatus}`);
                }
            } else if (dictionary.CLEAN_MODE_FROM_ECOVACS[payload['state']] === 'idle') {
                // when clean state = idle the bot can be charging on the dock or the return to dock has been canceled
                // if this is not run, the status when canceling the return stays on 'returning'
                this.run('GetChargeState');
            }
        }
        tools.envLogResult(`cleanReport: ${this.cleanReport}`);
    }

    /**
     * Handle the payload of the `Battery` response/message (battery level)
     * @param {Object} payload
     */
    handleBattery(payload) {
        this.batteryLevel = payload['value'];
        if (payload.hasOwnProperty('isLow')) {
            this.batteryIsLow = !!Number(payload['isLow']);
        } else {
            this.batteryIsLow = (this.batteryLevel >= 15);
        }
        tools.envLogResult(`batteryLevel: ${this.batteryLevel}%`);
        tools.envLogResult(`batteryIsLow: ${this.batteryIsLow}`);
    }

    /**
     * Handle the payload of the `LifeSpan` response/message
     * (information about accessories components)
     * @param {Object} payload
     */
    handleLifespan(payload) {
        for (let index in payload) {
            if (payload[index]) {
                const type = payload[index][`type`];
                let component = type;
                if (dictionary.COMPONENT_FROM_ECOVACS[type]) {
                    component = dictionary.COMPONENT_FROM_ECOVACS[type];
                } else {
                    tools.envLogWarn(`unknown life span component type: ${type}`);
                    this.ecovacs.emit('Debug', `Unknown life span component type: ${type}`);
                }
                const left = payload[index]['left'];
                const total = payload[index]['total'];
                const lifespan = parseInt(left) / parseInt(total) * 100;
                this.components[component] = Number(lifespan.toFixed(2));
                tools.envLogResult(`lifespan ${component}: ${this.components[component]}`);
            }
        }
        tools.envLogResult(`lifespan components : ${JSON.stringify(this.components)}`);
    }

    /**
     * Handle the payload of the `Pos` response/message
     * (vacuum position and charger resp. charge position)
     * @param {Object} payload
     */
    handlePos(payload) {
        // is only available in some DeebotPosition messages (e.g. on start cleaning)
        // there can be more than one charging station only handles first charging station
        const chargePos = payload['chargePos'];
        if (chargePos) {
            // check if position changed
            let changed = (
                chargePos[0]['x'] !== this.chargePosition.x ||
                chargePos[0]['y'] !== this.chargePosition.y ||
                chargePos[0]['a'] !== this.chargePosition.a
            );
            if (changed) {
                this.chargePosition = {
                    x: chargePos[0]['x'],
                    y: chargePos[0]['y'],
                    a: chargePos[0]['a'],
                    changeFlag: true
                };
                tools.envLogResult(`chargePosition: ${JSON.stringify(this.chargePosition)}`);
            }
        }
        // as deebotPos and chargePos can also appear in other messages (CleanReport)
        // the handling should be extracted to a separate function
        const deebotPos = payload['deebotPos'];
        if (typeof deebotPos === 'object') {
            // check if position changed or currentSpotAreaID unknown
            let changed = (
                deebotPos['x'] !== this.deebotPosition.x ||
                deebotPos['y'] !== this.deebotPosition.y ||
                deebotPos['a'] !== this.deebotPosition.a ||
                deebotPos['invalid'] !== this.deebotPosition.isInvalid ||
                this.deebotPosition.currentSpotAreaID === 'unknown'
            );
            if (changed) {
                const posX = Number(deebotPos['x']);
                const posY = Number(deebotPos['y']);
                let currentSpotAreaID = mapTools.isPositionInSpotArea(posX, posY, this.mapSpotAreaInfos[this.currentMapMID]);
                let isInvalid = Number(deebotPos['invalid']) === 1;
                let distanceToChargingStation = null;
                if (this.chargePosition) {
                    const pos = deebotPos['x'] + ',' + deebotPos['y'];
                    const chargePos = this.chargePosition.x + ',' + this.chargePosition.y;
                    distanceToChargingStation = mapTools.getDistanceToChargingStation(pos, chargePos);
                }
                tools.envLogResult(`currentSpotAreaID = '${currentSpotAreaID}'`);
                this.deebotPosition = {
                    x: deebotPos['x'],
                    y: deebotPos['y'],
                    a: deebotPos['a'],
                    isInvalid: isInvalid,
                    currentSpotAreaID: currentSpotAreaID,
                    currentSpotAreaName: this.getSpotAreaName(currentSpotAreaID),
                    changeFlag: true,
                    distanceToChargingStation: distanceToChargingStation
                };
                tools.envLogResult(`deebotPosition: ${JSON.stringify(this.deebotPosition)}`);
            }
        }
    }

    /**
     * TODO: Find out the value of the 'Evt' message
     * @param {Object} payload - The payload of the event.
     */
    handleEvt(payload) {
        const code = payload['code'];
        tools.envLogWarn(`Unhandled Evt code: '${code}'`);
    }

    /**
     * Handle the payload of the `Speed` response/message (vacuum power resp. suction power)
     * @param {Object} payload
     */
    handleSpeed(payload) {
        const speed = payload['speed'];
        this.cleanSpeed = dictionary.CLEAN_SPEED_FROM_ECOVACS[speed];
        tools.envLogResult(`cleanSpeed: ${this.cleanSpeed}`);
    }

    /**
     * Handle the payload of the `NetInfo` response/message
     * (network addresses and Wi-Fi status)
     * @param {Object} payload
     */
    handleNetInfo(payload) {
        this.netInfoIP = payload['ip'];
        this.netInfoWifiSSID = payload['ssid'];
        this.netInfoWifiSignal = payload['rssi'];
        this.netInfoMAC = payload['mac'];

        tools.envLogResult(`netInfoIP: ${this.netInfoIP}`);
        tools.envLogResult(`netInfoWifiSSID: ${this.netInfoWifiSSID}`);
        tools.envLogResult(`netInfoWifiSignal: ${this.netInfoWifiSignal}`);
        tools.envLogResult(`netInfoMAC: ${this.netInfoMAC}`);
    }

    /**
     * Handle the payload of the `WaterInfo` response/message
     * (water level and water box status)
     * @param {Object} payload
     */
    handleWaterInfo(payload) {
        this.waterLevel = payload['amount'];
        tools.envLogResult(`waterLevel: ${this.waterLevel}`);
        this.waterboxInfo = payload['enable'];
        tools.envLogResult(`waterboxInfo: ${this.waterboxInfo}`);
        if (payload.hasOwnProperty('type')) {
            // 1 = Regular
            // 2 = OZMO Pro
            this.moppingType = payload['type'];
            tools.envLogResult(`WaterInfo type: ${this.moppingType}`);
        }
        if (payload.hasOwnProperty('sweepType')) {
            // Scrubbing pattern
            // 1 = Quick scrubbing
            // 2 = Deep scrubbing
            this.scrubbingType = payload['sweepType'];
            tools.envLogResult(`WaterInfo sweepType: ${this.scrubbingType}`);
        }
    }

    /**
     * Handle the payload of the `AirDring` (sic) response/message (air drying status)
     * @param {Object} payload
     */
    handleAirDryingState(payload) {
        let airDryingStatus = null;
        const status = parseInt(payload['status']);
        if (status === 1) {
            airDryingStatus = 'airdrying';
        } else if (status === 2) {
            airDryingStatus = 'idle';
        }
        if (airDryingStatus) {
            this.airDryingStatus = airDryingStatus;
            tools.envLogResult(`AirDryingState: ${this.airDryingStatus}`);
        }
    }

    /**
     * Handle the payload of the `BorderSpin` response/message
     * @param {Object} payload
     */
    handleBorderSpin(payload) {
        const enable = payload['enable'];
        const type = payload['type']; // The value of type seems to be always 1
        if (type) {
            this.borderSpin = enable;
            tools.envLogResult(`BorderSpin: ${this.borderSpin}`);
        }
    }

    /**
     * Handle the payload of the `SweepMode` response/message
     * @param {Object} payload
     */
    handleSweepMode(payload) {
        const type = parseInt(payload['type']);
        if (type) {
            this.sweepMode = type;
            tools.envLogResult(`SweepMode: ${this.sweepMode}`);
        }
    }

    /**
     * Handle the payload of the `ChargeState` response/message (charge status)
     * @param {Object} payload
     */
    handleChargeState(payload) {
        this.chargeStatus = 'idle';
        if (parseInt(payload['isCharging']) === 1) {
            this.chargeStatus = 'charging';
        }
        this.chargeMode = 'slot';
        if (payload.hasOwnProperty('mode')) {
            this.chargeMode = payload['mode'];
        }
    }

    /**
     * Handle the payload of the `Sleep` response/message (sleep status)
     * @param {Object} payload
     */
    handleSleepStatus(payload) {
        this.sleepStatus = payload['enable'];
        tools.envLogResult(`sleepStatus: ${this.sleepStatus}`);
    }

    /**
     * Handle the payload of the `CleanLogs` response/message
     * @param {Object} payload
     */
    handleCleanLogs(payload) {
        let logs = [];
        this.cleanLog = [];
        if (payload.hasOwnProperty('logs')) {
            logs = payload['logs'];
        } else if (payload.hasOwnProperty('log')) {
            logs = payload['log'];
        } else if (payload.hasOwnProperty('data')) {
            logs = payload['data'];
        }

        for (let logIndex in logs) {
            if (logs.hasOwnProperty(logIndex)) {
                const logEntry = logs[logIndex];
                if (!this.cleanLog[logEntry['id']]) { //log not yet existing
                    let squareMeters = parseInt(logEntry['area']);
                    let timestamp = Number(logEntry['ts']);
                    let date = new Date(timestamp * 1000);
                    let len = parseInt(logEntry['last']);
                    let totalTimeString = tools.getTimeStringFormatted(len);
                    let imageUrl = logEntry['imageUrl'];
                    if ((this.cleanLog_lastTimestamp < timestamp) || (!this.cleanLog_lastTimestamp)) {
                        this.cleanLog_lastImageUrl = imageUrl;
                        this.cleanLog_lastTimestamp = timestamp;
                        this.cleanLog_lastSquareMeters = squareMeters;
                        this.cleanLog_lastTotalTime = len;
                        this.cleanLog_lastTotalTimeString = totalTimeString;
                        tools.envLogResult(`cleanLog_lastImageUrl: ${this.cleanLog_lastImageUrl}`);
                        tools.envLogResult(`cleanLog_lastTimestamp: ${this.cleanLog_lastTimestamp}`);
                        tools.envLogResult(`cleanLog_lastSquareMeters: ${this.cleanLog_lastSquareMeters}`);
                        tools.envLogResult(`cleanLog_lastTotalTime: ${this.cleanLog_lastTotalTime}`);
                        tools.envLogResult(`cleanLog_lastTotalTimeString: ${this.cleanLog_lastTotalTimeString}`);
                    }
                    this.cleanLog[logEntry['id']] = {
                        'squareMeters': squareMeters,
                        'timestamp': timestamp,
                        'date': date,
                        'lastTime': len,
                        'totalTime': len,
                        'totalTimeFormatted': totalTimeString,
                        'imageUrl': imageUrl,
                        'type': logEntry['type'],
                        'stopReason': logEntry['stopReason']
                    };
                }
            }
        }
        tools.envLogResult(`cleanLogs: ${JSON.stringify(this.cleanLog)}`);
    }

    /**
     * Handle the payload of the `TotalStats` response/message
     * @param {Object} payload
     */
    handleTotalStats(payload) {
        this.cleanSum_totalSquareMeters = parseInt(payload['area']);
        this.cleanSum_totalSeconds = parseInt(payload['time']);
        this.cleanSum_totalNumber = parseInt(payload['count']);
        tools.envLogResult(`totalSquareMeters: ${this.cleanSum_totalSquareMeters}`);
        tools.envLogResult(`totalSeconds: ${this.cleanSum_totalSeconds}`);
        tools.envLogResult(`totalNumber: ${this.cleanSum_totalNumber}`);
    }

    /**
     * Handle the payload of the `RelocationState` response/message
     * @param {Object} payload
     */
    handleRelocationState(payload) {
        this.relocationState = payload['state'];
        tools.envLogResult(`relocationState: ${this.relocationState}`);
    }

    /**
     * Handle the payload of the `Volume` response/message
     * @param {Object} payload
     */
    handleVolume(payload) {
        this.volume = payload['volume'];
        tools.envLogResult(`volume: ${this.volume}`);
    }

    /**
     * Handle the payload of the `BreakPoint` response/message
     * @param {Object} payload
     */
    handleBreakPoint(payload) {
        this.breakPoint = payload['enable'];
        tools.envLogResult(`breakPoint: ${this.breakPoint}`);
    }

    /**
     * Handle the payload of the `Block` response/message
     * @param {Object} payload
     */
    handleBlock(payload) {
        this.block = payload['enable'];
        tools.envLogResult(`block: ${this.block}`);
        if (payload.hasOwnProperty('start')) {
            this.blockTime = {
                'from': payload['start'],
                'to': payload['end']
            };
            tools.envLogResult(`blockTime: ${JSON.stringify(this.blockTime)}`);
        }
    }

    /**
     * Handle the payload of the 'AutoEmpty' response/message
     * @param {Object} payload
     */
    handleAutoEmpty(payload) {
        this.autoEmpty = payload['enable'];
        if (payload.hasOwnProperty('status')) {
            // 0 disabled
            // 1 enabled
            // 2 dust bag not full
            // 5 dust bag need to be changed
            this.autoEmptyStatus = payload['status'];
            tools.envLogResult(`autoEmptyStatus: ${this.autoEmptyStatus}`);
        }
        tools.envLogResult(`autoEmpty: ${this.autoEmpty}`);
    }

    /**
     * Handle the payload of the 'AdvancedMode' response/message
     * @param {Object} payload
     */
    handleAdvancedMode(payload) {
        this.advancedMode = payload['enable'];
        tools.envLogResult(`advancedMode: ${this.advancedMode}`);
    }

    /**
     * Handle the payload of the 'TrueDetect' response/message
     * @param {Object} payload
     */
    handleTrueDetect(payload) {
        this.trueDetect = payload['enable'];
        tools.envLogResult(`trueDetect: ${this.trueDetect}`);
    }

    /**
     * Handle the payload of the 'CleanCount' response/message
     * @param {Object} payload
     */
    handleCleanCount(payload) {
        this.cleanCount = payload['count'];
        tools.envLogResult(`cleanCount: ${this.cleanCount}`);
    }

    /**
     * Handle the payload of the 'DusterRemind' response/message
     * @param {Object} payload
     */
    handleDusterRemind(payload) {
        this.dusterRemind = {
            enabled: payload['enable'],
            period: payload['period']
        };
        tools.envLogResult(`dusterRemind: ${JSON.stringify(this.dusterRemind)}`);
    }

    /**
     * Handle the payload of the 'CarpertPressure' (sic) response/message
     * @param {Object} payload
     */
    handleCarpetPressure(payload) {
        this.carpetPressure = payload['enable'];
        tools.envLogResult(`carpetPressure: ${this.carpetPressure}`);
    }

    handleCleanPreference(payload) {
        this.cleanPreference = payload['enable'];
        tools.envLogResult(`cleanPreference: ${this.cleanPreference}`);
    }

    handleLiveLaunchPwdState(payload) {
        this.liveLaunchPwdState = {
            state: payload.state,
            hasPwd: payload.hasPwd
        };
        tools.envLogResult(`liveLaunchPwdState: ${JSON.stringify(this.liveLaunchPwdState)}`);
    }

    handleWiFiList(payload) {
        if (payload.list) {
            tools.envLogInfo('Configured networks:');
            payload.list.forEach((network) => {
                tools.envLogInfo('- ' + network);
            });
        }
        tools.envLogInfo(`mac address: ${payload.mac}`);
    }

    handleOverTheAirUpdate(payload) {
        this.OTA = payload;
        tools.envLogInfo(`ota status: ${JSON.stringify(payload)}`);
    }

    handleTimeZone(payload) {
        this.timezone = 'GMT' + (payload.tzm > 0 ? '+' : '-') + (payload.tzm / 60) + ':00';
    }

    /**
     * Handle the payload of the 'Stats' response/message
     * @param {Object} payload
     */
    handleStats(payload) {
        this.currentStats = {
            'cleanedArea': payload['area'],
            'cleanedSeconds': payload['time'],
            'cleanType': payload['type']
        };
        if (payload.hasOwnProperty('avoidCount')) {
            if (this.avoidedObstacles !== payload['avoidCount']) {
                tools.envLogNotice('whoops ... there might be something in the way');
                tools.envLogResult(`avoidedObstacles: ${this.avoidedObstacles}`);
            }
            this.avoidedObstacles = payload['avoidCount'];
        }
        if (payload.hasOwnProperty('aiopen') && Number(payload['aiopen']) === 1) {
            if (JSON.stringify(this.obstacleTypes) !== JSON.stringify(payload['aitypes'])) {
                tools.envLogNotice('whoops ... there might be something new blocking my way');
                tools.envLogResult(`obstacleTypes: ${this.obstacleTypes}`);
            }
            this.obstacleTypes = payload['aitypes'];
        }
    }

    /**
     * Handle the payload of the 'Sched' response/message (Schedule)
     * @param {Object} payload
     */
    handleSched(payload) {
        this.schedule = [];
        for (let c = 0; c < payload.length; c++) {
            const resultData = payload[c];
            if (resultData.repeat !== undefined) {
                let cleanCtl = {
                    'type': 'auto'
                };
                if (resultData.hasOwnProperty('content') && resultData.content.hasOwnProperty('jsonStr')) {
                    const json = JSON.parse(resultData.content.jsonStr);
                    Object.assign(cleanCtl, {
                        'type': json.type
                    });
                    if (cleanCtl.type === 'spotArea') {
                        Object.assign(cleanCtl, {
                            'spotAreas': json.content
                        });
                    }
                }
                const onlyOnce = Number(resultData.repeat) === 0;
                const weekdays = resultData.repeat.split('');
                const weekdaysObj = {
                    'Mon': Boolean(Number(weekdays[1])),
                    'Tue': Boolean(Number(weekdays[2])),
                    'Wed': Boolean(Number(weekdays[3])),
                    'Thu': Boolean(Number(weekdays[4])),
                    'Fri': Boolean(Number(weekdays[5])),
                    'Sat': Boolean(Number(weekdays[6])),
                    'Sun': Boolean(Number(weekdays[0]))
                };
                const object = {
                    'sid': resultData.sid,
                    'cleanCmd': cleanCtl,
                    'content': resultData.content,
                    'enabled': Boolean(Number(resultData.enable)),
                    'onlyOnce': onlyOnce,
                    'weekdays': weekdaysObj,
                    'hour': resultData.hour,
                    'minute': resultData.minute,
                    'mapID': resultData.mid
                };
                this.schedule.push(object);
            }
        }
        if (this.schedule.length) {
            tools.envLogResult(`schedule: ${JSON.stringify(this.schedule)}`);
        }
    }

    /**
     * Handle the payload of the 'CachedMapInfo' response/message
     * @param {Object} payload
     */
    handleCachedMapInfo(payload) {
        this.currentMapName = 'unknown';
        this.maps = {'maps': []};
        const infoEvent = payload['info'];
        for (let mapIndex in infoEvent) {
            if (infoEvent.hasOwnProperty(mapIndex)) {
                if (infoEvent[mapIndex]['mid'] !== '0') {
                    this.maps['maps'].push(
                        new map.EcovacsMap(
                            infoEvent[mapIndex]['mid'],
                            infoEvent[mapIndex]['index'],
                            infoEvent[mapIndex]['name'],
                            infoEvent[mapIndex]['status'],
                            infoEvent[mapIndex]['using'],
                            infoEvent[mapIndex]['built']
                        )
                    );
                    if (infoEvent[mapIndex]['using'] === 1) {
                        this.currentMapName = infoEvent[mapIndex]['name'];
                        this.currentMapMID = infoEvent[mapIndex]['mid'];
                        this.currentMapIndex = infoEvent[mapIndex]['index'];
                    }
                }
            }
        }
        tools.envLogResult(`currentMapName: ${this.currentMapName}`);
        tools.envLogResult(`currentMapMID: ${this.currentMapMID}`);
        tools.envLogResult(`currentMapIndex: ${this.currentMapIndex}`);
        tools.envLogResult(`maps: ${JSON.stringify(this.maps)}`);
    }

    /**
     * Handle the payload of the 'MapInfo_V2' response/message
     * @param {Object} payload
     */
    handleMapInfoV2(payload) {
        this.currentMapMID = payload['mid'];
        this.currentMapName = 'standard';
        this.currentMapIndex = 0;
        this.maps = {'maps': []};
        this.maps['maps'].push(
            new map.EcovacsMap(
                this.currentMapMID,
                this.currentMapIndex,
                this.currentMapName,
                1,
                1,
                1)
        );
        tools.envLogResult(`currentMapName: ${this.currentMapName}`);
        tools.envLogResult(`currentMapMID: ${this.currentMapMID}`);
        tools.envLogResult(`currentMapIndex: ${this.currentMapIndex}`);
        tools.envLogResult(`maps: ${JSON.stringify(this.maps)}`);
    }

    /**
     * Handle the payload of the 'MapSet' response/message
     * @param {Object} payload
     */
    handleMapSet(payload) {
        let mapMID = payload['mid'];
        if (isNaN(mapMID)) {
            if (this.currentMapMID) {
                mapMID = this.currentMapMID;
            } else {
                tools.envLogWarn('mid is not a number. Skipping message for map');
                return {mapsetEvent: 'skip'};
            }
        }
        if (payload['type'] === 'ar') {
            let mapSpotAreas = new map.EcovacsMapSpotAreas(mapMID, payload['msid']);
            for (let mapIndex in payload['subsets']) {
                if (payload['subsets'].hasOwnProperty(mapIndex)) {
                    mapSpotAreas.push(new map.EcovacsMapSpotArea(payload['subsets'][mapIndex]['mssid']));
                }
            }
            tools.envLogResult(`MapSpotAreas: ${JSON.stringify(mapSpotAreas)}`);
            return {
                mapsetEvent: 'MapSpotAreas',
                mapsetData: mapSpotAreas
            };
        } else if ((payload['type'] === 'vw') || (payload['type'] === 'mw')) {
            if (typeof this.mapVirtualBoundaries[mapMID] === 'undefined') {
                tools.envLogResult(`initialize mapVirtualBoundaries for map ${mapMID}`);
                this.mapVirtualBoundaries[mapMID] = new map.EcovacsMapVirtualBoundaries(mapMID);  //initialize array for mapVirtualBoundaries if not existing
                this.mapVirtualBoundariesResponses[mapMID] = [false, false];
            }
            for (let mapIndex in payload['subsets']) {
                if (payload['subsets'].hasOwnProperty(mapIndex)) {
                    this.mapVirtualBoundaries[mapMID].push(new map.EcovacsMapVirtualBoundary(payload['subsets'][mapIndex]['mssid'], payload['type']));
                }
            }
            if (payload['type'] === 'vw') {
                this.mapVirtualBoundariesResponses[mapMID][0] = true;
            } else if (payload['type'] === 'mw') {
                this.mapVirtualBoundariesResponses[mapMID][1] = true;
            }
            tools.envLogResult(`mapVirtualBoundaries: ${JSON.stringify(this.mapVirtualBoundaries[mapMID])}`);
            if (this.mapVirtualBoundariesResponses[mapMID][0] && this.mapVirtualBoundariesResponses[mapMID][1]) { //only return if both responses were processed
                return {
                    mapsetEvent: 'MapVirtualBoundaries',
                    mapsetData: this.mapVirtualBoundaries[mapMID]
                };
            } else {
                tools.envLogWarn(`skip message for map  ` + mapMID);
                return {
                    mapsetEvent: 'skip'
                };
            }
        }

        tools.envLogWarn(`unknown mapset type: ${JSON.stringify(payload['type'])}`);
        return {mapsetEvent: 'error'};
    }

    /**
     * Handle the payload of the 'MapSubSet' response/message
     * @param {Object} payload
     * @returns {Promise<Object>}
     */
    async handleMapSubset(payload) {
        let mapMID = payload['mid'];
        if (isNaN(mapMID)) {
            mapMID = this.currentMapMID;
        }
        if (payload['type'] === 'ar') {
            let mapSpotAreaBoundaries = payload['value'];
            if (payload['compress']) {
                mapSpotAreaBoundaries = await map.mapPieceToIntArray(payload['value']);
            }
            let customName = '';
            if (payload['name']) {
                customName = payload['name'];
            }
            //TODO: filter out reportMapSubSet events (missing data)
            //reportMapSubSet event comes without map reference, replace
            let mapSpotAreaInfo = new map.EcovacsMapSpotAreaInfo(
                mapMID,
                payload['mssid'],
                payload['connections'], //reportMapSubSet event comes without connections
                mapSpotAreaBoundaries,
                payload['subtype'],
                customName
            );
            // Cleaning preference
            if (payload.hasOwnProperty('cleanset') && (payload['cleanset'] !== '')) {
                mapSpotAreaInfo.setCleanSet(payload['cleanset']);
            }
            // Cleaning sequence
            if (payload.hasOwnProperty('index')) {
                mapSpotAreaInfo.setIndex(payload['index']);
            }
            if (typeof this.mapSpotAreaInfos[mapMID] === 'undefined') {
                this.mapSpotAreaInfos[mapMID] = []; //initialize array for mapSpotAreaInfos if not existing
            }
            this.mapSpotAreaInfos[mapMID][payload['mssid']] = mapSpotAreaInfo;
            return {
                mapsubsetEvent: 'MapSpotAreaInfo',
                mapsubsetData: mapSpotAreaInfo
            };
        } else if ((payload['type'] === 'vw') || (payload['type'] === 'mw')) {
            let mapVirtualBoundaryInfo = new map.EcovacsMapVirtualBoundaryInfo(mapMID, payload['mssid'], payload['type'], payload['value']);
            if (typeof this.mapVirtualBoundaryInfos[mapMID] === 'undefined') {
                this.mapVirtualBoundaryInfos[mapMID] = []; //initialize array for mapVirtualBoundaryInfos if not existing
            }
            this.mapVirtualBoundaryInfos[mapMID][payload['mssid']] = mapVirtualBoundaryInfo;
            tools.envLogResult(`MapVirtualBoundaryInfo: ${JSON.stringify(mapVirtualBoundaryInfo)}`);
            return {
                mapsubsetEvent: 'MapVirtualBoundaryInfo',
                mapsubsetData: mapVirtualBoundaryInfo
            };
        }

        tools.envLogWarn(`unknown mapset type: ${JSON.stringify(payload['type'])}`);
        return {
            mapsubsetEvent: 'error'
        };
    }

    /**
     * Handle the payload of the 'MapInfo' response/message
     * @param {Object} payload
     * @returns {Promise<Object>}
     */
    async handleMapInfo(payload) {
        const mapMID = payload['mid'];
        const type = payload['type'];
        if (isNaN(mapMID)) {
            return null;
        }
        if (typeof this.mapImages[mapMID] === 'undefined') {
            this.mapImages[mapMID] = [];
        }
        if (typeof this.mapImages[mapMID][type] === 'undefined') {
            const ecovacsMapImage = new map.EcovacsMapImage(mapMID, type, payload['totalWidth'], payload['totalHeight'], payload['pixel'], payload['totalCount']);
            this.mapImages[mapMID][type] = ecovacsMapImage;
        }
        if (payload['pieceValue'] !== '') {
            await this.mapImages[mapMID][type].updateMapPiece(payload['index'], payload['startX'], payload['startY'], payload['width'], payload['height'], payload['crc'], payload['value']);
        }
        try {
            return await this.mapImages[mapMID][type].getBase64PNG(this.deebotPosition, this.chargePosition, this.currentMapMID);
        } catch (e) {
            tools.envLogError(`error calling getBase64PNG: ${e.message}`);
            throw new Error(e);
        }
    }

    /**
     * @todo: finish the implementation
     * @param {Object} payload
     */
    handleMajorMap(payload) {
        let mapMID = payload['mid'];
        if (isNaN(mapMID)) {
            return;
        }
        if (!this.liveMapImage || (this.liveMapImage.mapID !== mapMID)) {
            const type = payload['type'];
            const pieceWidth = payload['pieceWidth'];
            const pieceHeight = payload['pieceHeight'];
            const cellWidth = payload['cellWidth'];
            const cellHeight = payload['cellHeight'];
            const pixel = payload['pixel'];
            const value = payload['value'];
            this.liveMapImage = new map.EcovacsLiveMapImage(
                mapMID, type, pieceWidth, pieceHeight, cellWidth, cellHeight, pixel, value);
        } else {
            this.liveMapImage.updateMapDataPiecesCrc(payload['value']);
        }
    }

    /**
     * @todo: finish the implementation
     * @param {Object} payload
     * @returns {Promise<null|{mapID: any, mapType: any, mapBase64PNG: string}>}
     */
    async handleMinorMap(payload) {
        let mapMID = payload['mid'];
        if (isNaN(mapMID) || !this.liveMapImage || (this.liveMapImage.mapID !== mapMID)) {
            return null;
        }
        await this.liveMapImage.updateMapPiece(payload['pieceIndex'], payload['pieceValue']);
        try {
            return this.liveMapImage.getBase64PNG(this.deebotPosition, this.chargePosition, this.currentMapMID);
        } catch (e) {
            tools.envLogError(`error calling getBase64PNG: ${e.message}`);
            throw new Error(e);
        }
    }

    /**
     * Handle the payload of the 'Error' response/message
     * @param {Object} payload
     */
    handleResponseError(payload) {
        this.errorCode = payload['code'].toString();
        // known errorCode from library
        if (errorCodes[this.errorCode]) {
            this.errorDescription = errorCodes[this.errorCode];
            // Request error
            if (this.errorCode === '1') {
                this.errorDescription = this.errorDescription + ': ' + payload.error;
            }
        } else {
            this.errorDescription = `unknown errorCode: ${this.errorCode}`;
        }
        if (this.errorCode !== '0') {
            tools.envLogWarn(`errorCode: ${this.errorCode}`);
            tools.envLogWarn(`errorDescription: ${this.errorDescription}`);
        }
    }

    handleAirQuality(payload) {
        this.airQuality = {
            'particulateMatter25': payload['pm25'],
            'pm_10': payload['pm_10'],
            'particulateMatter10': payload['pm10'],
            'airQualityIndex': payload['aq'],
            'volatileOrganicCompounds': payload['voc'],
            'temperature': payload['tem'],
            'humidity': payload['hum']
        };
        tools.envLogResult(`particulateMatter25: ${this.airQuality.particulateMatter25}`);
        tools.envLogResult(`pm_10: ${this.airQuality.pm_10}`);
        tools.envLogResult(`particulateMatter10: ${this.airQuality.particulateMatter10}`);
        tools.envLogResult(`airQualityIndex: ${this.airQuality.airQualityIndex}`);
        tools.envLogResult(`volatileOrganicCompounds: ${this.airQuality.volatileOrganicCompounds}`);
        tools.envLogResult(`temperature: ${this.airQuality.temperature}`);
        tools.envLogResult(`humidity: ${this.airQuality.humidity}`);
    }

    /**
     * Handle the payload of the 'AiBlockPlate' response/message
     * @param {Object} payload
     */
    handleGetAiBlockPlate(payload) {
        this.aiBlockPlate = payload['on'];
        tools.envLogResult(`aiBlockPlate: ${this.aiBlockPlate}`);
    }

    /**
     * Handle the payload of the 'MonitorAirState' response/message
     * @param {Object} payload
     */
    handleGetMonitorAirState(payload) {
        this.monitorAirState = payload['on'];
        tools.envLogResult(`monitorAirState: ${this.monitorAirState}`);
    }

    /**
     * Handle the payload of the 'AngleFollow' response/message
     * @param {Object} payload
     */
    handleGetAngleFollow(payload) {
        this.angleFollow = payload['on'];
        tools.envLogResult(`angleFollow: ${this.angleFollow}`);
    }

    /**
     * Handle the payload of the 'Mic' response/message
     * @param {Object} payload
     */
    handleGetMic(payload) {
        this.mic = payload['on'];
        tools.envLogResult(`mic: ${this.mic}`);
    }

    /**
     * Handle the payload of the 'VoiceSimple' response/message
     * @param {Object} payload
     */
    handleGetVoiceSimple(payload) {
        this.voiceSimple = payload['on'];
        tools.envLogResult(`voiceSimple: ${this.voiceSimple}`);
    }

    /**
     * Handle the payload of the 'DrivingWheel' response/message
     * @param {Object} payload
     */
    handleGetDrivingWheel(payload) {
        this.drivingWheel = payload['on'];
        tools.envLogResult(`drivingWheel: ${this.drivingWheel}`);
    }

    /**
     * Handle the payload of the 'ChildLock' response/message
     * @param {Object} payload
     */
    handleGetChildLock(payload) {
        this.childLock = payload['on'];
        tools.envLogResult(`childLock: ${this.childLock}`);
    }

    /**
     * Handle the payload of the 'VoiceAssistantState' response/message
     * @param {Object} payload
     */
    handleVoiceAssistantState(payload) {
        this.voiceAssistantState = payload['enable'];
        tools.envLogResult(`voiceAssistantState: ${this.voiceAssistantState}`);
    }

    /**
     * Handle the payload of the 'HumanoidFollow' response/message
     * @param {Object} payload
     */
    handleHumanoidFollow(payload) {
        this.humanoidFollow = {
            'yiko': payload['yiko'],
            'video': payload['video']
        };
        tools.envLogResult(`humanoidFollow: ${JSON.stringify(this.humanoidFollow)}`);
    }

    /**
     * Handle the payload of the 'AutonomousClean' response/message
     * @param {Object} payload
     */
    handleGetAutonomousClean(payload) {
        this.autonomousClean = payload['on'];
        tools.envLogResult(`autonomousClean: ${this.autonomousClean}`);
    }

    /**
     * Handle the payload of the 'BlueSpeaker' response/message
     * @param {Object} payload
     */
    handleGetBlueSpeaker(payload) {
        this.bluetoothSpeaker = {
            'enabled': payload['enable'],
            'timeout': payload['time'],
            'name': payload['name']
        };
        tools.envLogResult(`bluetoothSpeaker: ${JSON.stringify(this.bluetoothSpeaker)}`);
    }

    /**
     * Handle the payload of the 'AngleWakeup' response/message
     * @param {Object} payload
     */
    handleAngleWakeup(payload) {
        this.angleWakeup = payload['on'];
        tools.envLogResult(`angleWakeup: ${this.angleWakeup}`);
    }

    /**
     * Handle the payload of the 'Efficiency' response/message
     * @param {Object} payload
     */
    handleEfficiency(payload) {
        this.efficiency = payload['efficiency'];
        tools.envLogResult(`efficiency: ${this.efficiency}`);
    }

    /**
     * Handle the payload of the 'Efficiency' response/message
     * @param {Object} payload
     */
    handleGetAtmoLight(payload) {
        this.atmoLightIntensity = payload['intensity'];
        tools.envLogResult(`atmoLightIntensity: ${this.atmoLightIntensity} of ${payload['total']}`);
    }

    /**
     * Handle the payload of the '(FwBuryPoint-)Sysinfo' response/message
     * @param {Object} payload
     */
    handleSysinfo(payload) {
        try {
            let event = JSON.parse(payload)['body'][0];
            this.sysinfo = {
                'load': event['uptime'].substring(event['uptime'].indexOf('average') + 9),
                'uptime': event['uptime'].substring(event['uptime'].indexOf('up') + 3).substr(0, event['uptime'].substring(event['uptime'].indexOf('up') + 3).indexOf('users')).substr(0, event['uptime'].substring(event['uptime'].indexOf('up') + 3).substr(0, event['uptime'].substring(event['uptime'].indexOf('up') + 3).indexOf('users')).lastIndexOf(',')),
                'signal': event['signal'],
                'meminfo': event['meminfo'],
                'pos': event['pos']
            };
            tools.envLogResult(`system information: ${JSON.stringify(this.sysinfo)}`);
        } catch (e) {
            tools.envLogWarn(`error handling System information: ${e.toString()}`);
        }
    }

    /**
     * Handle the payload of the 'AirbotAutoMode' response/message
     * @param {Object} payload
     */
    handleAirbotAutoModel(payload) {
        this.airbotAutoModel = {
            'enable': payload['enable'],
            'trigger': payload['trigger'],
            'aq': {
                'aqStart': payload['aqStart'],
                'aqEnd': payload['aqEnd']
            }
        };
        tools.envLogResult(`airbotAutoModel: ${JSON.stringify(this.airbotAutoModel)}`);
    }

    /**
     * Handle the payload of the 'ThreeModule' (UV, Humidifier, AirFreshener) response/message
     * @param {Object} payload
     */
    handleThreeModule(payload) {
        payload.forEach((module) => {
            if (module.type === 'uvLight') {
                this.uvAirCleaning = {
                    'enabled': module.enable
                };
            }
            if (module.type === 'smell') {
                this.airFreshening = {
                    'enabled': module.enable,
                    'level': module.level,
                    'error': module.err
                };
            }
            if (module.type === 'humidify') {
                this.humidification = {
                    'enabled': module.enable,
                    'level': module.level
                };
            }
        });
    }

    /**
     * Handle the payload of the 'AreaPoint' response/message
     * @param {Object} payload
     */
    handleAreaPoint(payload) {
        this.areaPoint = {
            'mapId': payload['mid'],
            'locationPoints': payload['items']
        };
        tools.envLogResult(`areaPoint: ${JSON.stringify(this.areaPoint)}`);
    }

    handleTask(type, payload) {
        this.currentTask = {
            'type': type,
            'triggerType': payload.hasOwnProperty('triggerType') ? payload['triggerType'] : 'none',
            'failed': false
        };
        if (payload.hasOwnProperty('go_fail')) {
            this.currentTask.failed = true;
        }
        if (payload.hasOwnProperty('stopReason')) {
            // why has it stopped?
        }
        tools.envLogResult(`Task: ${JSON.stringify(this.currentTask)}`);
    }

    handleAudioCallState(event) {
        tools.envLogResult(`Unhandled AudioCallState: ${JSON.stringify(event)}`);
    }

    handleDModule(payload) {
        this.dmodule = payload;
        tools.envLogResult(`DModule: ${JSON.stringify(payload)}`);
    }

    /**
     * Run a specific command
     * @param {string} command - The {@link https://github.com/mrbungle64/ecovacs-deebot.js/wiki/Shortcut-functions|command}
     * @param args - zero or more arguments to perform the command
     */
    run(command, ...args) {
        super.run(command, ...args);
        switch (command.toLowerCase()) {
            case 'GetMapImage'.toLowerCase(): {
                const mapID = args[0].toString(); // mapID is a string
                const mapType = args[1] || 'outline';
                this.createMapDataObject = true;
                this.createMapImage = true;
                this.createMapImageOnly = args[2] !== undefined ? args[2] : true;
                if (Number(mapID) > 0) {
                    this.sendCommand(new VacBotCommand.GetMapImage(mapID, mapType));
                }
                break;
            }
            case 'GetMaps'.toLowerCase(): {
                this.createMapImageOnly = false;
                this.createMapDataObject = !!args[0] || false;
                this.createMapImage = this.createMapDataObject && this.isMapImageSupported();
                if (args.length >= 2) {
                    this.createMapImage = !!args[1];
                }
                // Workaround for some yeedi models
                // TODO: Find a better solution
                if ((this.deviceClass === 'p5nx9u') || (this.deviceClass === 'vthpeg')) {
                    this.sendCommand(new VacBotCommand.GetMapInfo_V2());
                } else {
                    this.sendCommand(new VacBotCommand.GetMaps());
                }
                break;
            }
            case 'GetSpotAreas'.toLowerCase(): {
                const mapID = args[0]; // mapID is a string
                if (Number(mapID) > 0) {
                    this.sendCommand(new VacBotCommand.GetMapSpotAreas(mapID));
                }
                break;
            }
            case 'GetSpotAreaInfo'.toLowerCase(): {
                const mapID = args[0]; // mapID is a string
                const spotAreaID = args[1]; // spotAreaID is a string
                if ((Number(mapID) > 0) && (spotAreaID !== '')) {
                    this.sendCommand(new VacBotCommand.GetMapSpotAreaInfo(mapID, spotAreaID));
                }
                break;
            }
            case 'GetVirtualBoundaries'.toLowerCase(): {
                const mapID = args[0]; // mapID is a string
                if (Number(mapID) > 0) {
                    if (typeof this.mapVirtualBoundariesResponses[mapID] === 'undefined') {
                        this.mapVirtualBoundariesResponses[mapID] = [false, false];
                    } else {
                        this.mapVirtualBoundariesResponses[mapID][0] = false;
                        this.mapVirtualBoundariesResponses[mapID][1] = false;
                    }
                    this.sendCommand(new VacBotCommand.GetMapVirtualBoundaries(mapID, 'vw'));
                    this.sendCommand(new VacBotCommand.GetMapVirtualBoundaries(mapID, 'mw'));
                }
                break;
            }
            case 'GetVirtualBoundaryInfo'.toLowerCase(): {
                const mapID = args[0]; // mapID is a string
                const spotAreaID = args[1]; // spotAreaID is a string
                const type = tools.isValidVirtualWallType(args[2]) ? args[2] : 'vw';
                if ((Number(mapID) > 0) && (spotAreaID !== '')) {
                    this.sendCommand(new VacBotCommand.GetMapVirtualBoundaryInfo(mapID, spotAreaID, type));
                }
                break;
            }
            case 'AddVirtualBoundary'.toLowerCase(): {
                const mapID = args[0]; // mapID is a string
                const coordinates = args[1];
                const type = tools.isValidVirtualWallType(args[2]) ? args[2] : 'vw';
                if ((Number(mapID) > 0) && (coordinates !== '')) {
                    this.sendCommand(new VacBotCommand.AddMapVirtualBoundary(mapID, coordinates, type));
                }
                break;
            }
            case 'DeleteVirtualBoundary'.toLowerCase(): {
                const mapID = args[0]; // mapID is a string
                const spotAreaID = args[1]; // spotAreaID is a string
                const type = args[2];
                if ((Number(mapID) > 0) && (Number(spotAreaID) >= 0) && (tools.isValidVirtualWallType(type))) {
                    this.sendCommand(new VacBotCommand.DeleteMapVirtualBoundary(mapID, spotAreaID, type));
                }
                break;
            }
            case 'GetLifeSpan'.toLowerCase(): {
                if (!args.length) {
                    this.emitFullLifeSpanEvent = true;
                    this.components = {};
                    this.lastComponentValues = {};
                    const componentsArray = [
                        dictionary.COMPONENT_TO_ECOVACS['filter'],
                        dictionary.COMPONENT_TO_ECOVACS['side_brush']
                    ];
                    if (this.hasMainBrush()) {
                        componentsArray.push(dictionary.COMPONENT_TO_ECOVACS['main_brush']);
                    }
                    if (this.hasUnitCareInfo()) {
                        componentsArray.push(dictionary.COMPONENT_TO_ECOVACS['unit_care']);
                    }
                    if (this.hasRoundMopInfo()) {
                        componentsArray.push(dictionary.COMPONENT_TO_ECOVACS['round_mop']);
                    }
                    this.sendCommand(new VacBotCommand.GetLifeSpan(componentsArray));
                } else {
                    this.emitFullLifeSpanEvent = false;
                    const component = args[0];
                    const componentsArray = [
                        dictionary.COMPONENT_TO_ECOVACS[component]
                    ];
                    this.sendCommand(new VacBotCommand.GetLifeSpan(componentsArray));
                }
                break;
            }
            case 'EnableDoNotDisturb'.toLowerCase(): {
                const start = args[0];
                const end = args[1];
                if ((start !== '') && (end !== '')) {
                    this.sendCommand(new VacBotCommand.EnableDoNotDisturb(start, end));
                } else {
                    this.sendCommand(new VacBotCommand.EnableDoNotDisturb());
                }
                break;
            }
            case 'SetDoNotDisturb'.toLowerCase(): {
                const enable = Number(!!args[0]);
                const start = args[1];
                const end = args[2];
                if ((start !== '') && (end !== '')) {
                    this.sendCommand(new VacBotCommand.SetDoNotDisturb(enable, start, end));
                } else if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetDoNotDisturb(enable));
                }
                break;
            }
            case 'GetWaterLevel'.toLowerCase():
            case 'GetWaterBoxInfo'.toLowerCase():
            case 'GetWaterInfo'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetWaterInfo());
                break;
            case 'GetCleanLogs'.toLowerCase():
                if (this.getModelType() === 'T9') {
                    this.callCleanResultsLogsApi().then((logData) => {
                        this.handleCleanLogs(logData);
                        let cleanLog = [];
                        for (let i in this.cleanLog) {
                            if (this.cleanLog.hasOwnProperty(i)) {
                                cleanLog.push(this.cleanLog[i]);
                            }
                        }
                        this.ecovacs.emit('CleanLog', cleanLog);
                        this.ecovacs.emit('CleanLog_lastImageUrl', this.cleanLog_lastImageUrl);
                        this.ecovacs.emit('CleanLog_lastImageTimestamp', this.cleanLog_lastTimestamp); // Deprecated
                        this.ecovacs.emit('CleanLog_lastTimestamp', this.cleanLog_lastTimestamp);
                        this.ecovacs.emit('CleanLog_lastSquareMeters', this.cleanLog_lastSquareMeters);
                        this.ecovacs.emit('CleanLog_lastTotalTimeString', this.cleanLog_lastTotalTimeString);
                        this.ecovacs.emit('LastCleanLogs', {
                            'timestamp': this.cleanLog_lastTimestamp,
                            'squareMeters': this.cleanLog_lastSquareMeters,
                            'totalTime': this.cleanLog_lastTotalTime,
                            'totalTimeFormatted': this.cleanLog_lastTotalTimeString,
                            'imageUrl': this.cleanLog_lastImageUrl
                        });
                    });
                } else {
                    this.sendCommand(new VacBotCommand.GetCleanLogs());
                }
                break;
            case 'GetError'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetError());
                break;
            case 'Relocate'.toLowerCase():
                this.sendCommand(new VacBotCommand.Relocate());
                break;
            case 'GetVolume'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetVolume());
                break;
            case 'SetVolume'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetVolume(args[0]));
                }
                break;
            case 'EnableAdvancedMode'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetAdvancedMode(1));
                break;
            case 'DisableAdvancedMode'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetAdvancedMode(0));
                break;
            case 'GetAdvancedMode'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetAdvancedMode());
                break;
            case 'GetTrueDetect'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetTrueDetect());
                break;
            case 'EnableTrueDetect'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetTrueDetect(1));
                break;
            case 'DisableTrueDetect'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetTrueDetect(0));
                break;
            case 'EmptyDustBin'.toLowerCase():
            case 'EmptySuctionStation'.toLowerCase():
                this.sendCommand(new VacBotCommand.EmptyDustBin());
                break;
            case 'GetAutoEmpty'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetAutoEmpty());
                break;
            case 'SetAutoEmpty'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetAutoEmpty(args[0]));
                }
                break;
            case 'EnableAutoEmpty'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetAutoEmpty(1));
                break;
            case 'DisableAutoEmpty'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetAutoEmpty(0));
                break;
            case 'GetDusterRemind'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetDusterRemind());
                break;
            case 'SetDusterRemind'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetDusterRemind(args[0], args[1]));
                }
                break;
            case 'GetCarpetPressure'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetCarpetPressure());
                break;
            case 'SetCarpetPressure'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetCarpetPressure(args[0]));
                }
                break;
            case 'EnableCarpetPressure'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetCarpetPressure(1));
                break;
            case 'DisableCarpetPressure'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetCarpetPressure(0));
                break;
            case 'GetCleanState_V2'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetCleanState_V2());
                break;
            case 'Clean_V2'.toLowerCase(): {
                if (tools.isAirPurifier(this.deviceClass)) {
                    this.sendCommand(new VacBotCommand.Clean_V2('move'));
                } else {
                    this.sendCommand(new VacBotCommand.Clean_V2());
                }
                break;
            }
            case 'SpotArea_V2'.toLowerCase(): {
                const area = args[0].toString();
                const cleanings = args[1] || 0;
                if (area !== '') {
                    this.sendCommand(new VacBotCommand.SpotArea_V2(area, cleanings));
                }
                break;
            }
            case 'CustomArea_V2'.toLowerCase(): {
                const area = args[0].toString();
                const cleanings = args[1] || 1;
                const donotClean = args[2] || 0;
                if (area !== '') {
                    this.sendCommand(new VacBotCommand.CustomArea_V2(area, cleanings, donotClean));
                }
                break;
            }
            case 'MapPoint_V2'.toLowerCase(): {
                const area = args[0].toString();
                if (area !== '') {
                    this.sendCommand(new VacBotCommand.MapPoint_V2(area));
                }
                break;
            }
            case 'GetCleanCount'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetCleanCount());
                break;
            case 'SetCleanCount'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetCleanCount(args[0]));
                }
                break;
            case 'GetCleanPreference'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetCleanPreference());
                break;
            case 'GetAirDrying'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetAirDrying());
                break;
            case 'SetAirDrying'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetAirDrying(args[0]));
                }
                break;
            case 'AirDryingStart'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetAirDrying('start'));
                break;
            case 'AirDryingStop'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetAirDrying('stop'));
                break;
            case 'SetCleanPreference'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetCleanPreference(args[0]));
                }
                break;
            case 'EnableCleanPreference'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetCleanPreference(1));
                break;
            case 'DisableCleanPreference'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetCleanPreference(0));
                break;
            case 'GetRecognization'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetRecognization());
                break;
            case 'GetMapState'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetMapState());
                break;
            case 'GetAIMap'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetAIMap());
                break;
            case 'GetSweepMode'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetSweepMode());
                break;
            case 'EnableSweepMode'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetSweepMode(1));
                break;
            case 'DisableSweepMode'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetSweepMode(0));
                break;
            case 'SetSweepMode'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetSweepMode(args[0]));
                }
                break;
            case 'GetBorderSpin'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetBorderSpin());
                break;
            case 'EnableBorderSpin'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetBorderSpin(1));
                break;
            case 'DisableBorderSpin'.toLowerCase():
                this.sendCommand(new VacBotCommand.SetBorderSpin(0));
                break;
            case 'SetBorderSpin'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetBorderSpin(args[0]));
                }
                break;
            case 'GetAirQuality'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetAirQuality());
                break;
            case 'SinglePoint_V2'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SinglePoint_V2(args[0]));
                }
                break;
            case 'Area_V2'.toLowerCase():
                this.sendCommand(new VacBotCommand.Area_V2());
                break;
            case 'GetMapSet_V2'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetMapSet_V2());
                break;
            case 'SetMapSet_V2'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetMapSet_V2(args[0]));
                }
                break;
            case 'SetThreeModule'.toLowerCase():
                if (args.length >= 3) {
                    this.sendCommand(new VacBotCommand.SetThreeModule(args[0], args[1], args[2]));
                }
                break;
            case 'SetFreshenerLevel'.toLowerCase():
                if (args.length >= 2) {
                    this.sendCommand(new VacBotCommand.SetFreshenerLevel(args[0], args[1]));
                }
                break;
            case 'SetHumidifierLevel'.toLowerCase():
                if (args.length >= 2) {
                    this.sendCommand(new VacBotCommand.SetHumidifierLevel(args[0], args[1]));
                }
                break;
            case 'SetUVCleaner'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetUVCleaner(args[0]));
                }
                break;
            case 'SetAtmoLight'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetAtmoLight(args[0]));
                }
                break;
            case 'SetBlueSpeaker'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetBlueSpeaker(args[0]));
                }
                break;
            case 'SetVoiceSimple'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetVoiceSimple(args[0]));
                }
                break;
            case 'SetBlock'.toLowerCase():
                if (args.length >= 3) {
                    this.sendCommand(new VacBotCommand.SetBlock(args[0], args[1], args[2]));
                }
                break;
            case 'SetMonitorAirState'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetMonitorAirState(args[0]));
                }
                break;
            case 'SetAngleFollow'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetAngleFollow(args[0]));
                }
                break;
            case 'SetMic'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetMic(args[0]));
                }
                break;
            case 'GetLiveLaunchPwdState'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetLiveLaunchPwdState());
                break;
            case 'GetHumanoidFollow'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetHumanoidFollow());
                break;
            case 'GetMonitorAirState'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetMonitorAirState());
                break;
            case 'GetVoiceSimple'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetVoiceSimple());
                break;
            case 'GetDrivingWheel'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetDrivingWheel());
                break;
            case 'GetChildLock'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetChildLock());
                break;
            case 'GetBlock'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetBlock());
                break;
            case 'GetTimeZone'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetTimeZone());
                break;
            case 'GetTotalStats'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetTotalStats());
                break;
            case 'GetWifiList'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetWifiList());
                break;
            case 'GetOta'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetOta());
                break;
            case 'GetThreeModuleStatus'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetThreeModuleStatus());
                break;
            case 'GetScene'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetScene());
                break;
            case 'GetListenMusic'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetListenMusic());
                break;
            case 'VideoOpened'.toLowerCase():
                this.sendCommand(new VacBotCommand.VideoOpened());
                break;
            case 'GetAudioCallState'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetAudioCallState());
                break;
            case 'SetVoice'.toLowerCase():
                if (args.length >= 6) {
                    this.sendCommand(new VacBotCommand.SetVoice(args[0], args[1], args[2], args[3], args[4], args[5]));
                }
                break;
            case 'SetVoiceAssistantState'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.SetVoiceAssistantState(args[0]));
                }
                break;
            case 'GetVoiceLifeRemindState'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetVoiceLifeRemindState());
                break;
            case 'GetBreakPoint'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetBreakPoint());
                break;
            case 'GetRelocationState'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetRelocationState());
                break;
            case 'GetAntiDrop'.toLowerCase():
                this.sendCommand(new VacBotCommand.GetAntiDrop());
                break;
            case 'GetMapTrace_V2'.toLowerCase():
                if (args.length >= 1) {
                    this.sendCommand(new VacBotCommand.GetMapTrace_V2(args[0]));
                }
                break;
        }
    }
}

module.exports = VacBot_950type;