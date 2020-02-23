const dictionary = require('./ecovacsConstants_non950type.js');
const vacBotCommand = require('./vacBotCommand_non950type.js');
const errorCodes = require('./errorCodes');
const tools = require('./tools.js');

class VacBot_non950type {
  constructor(user, hostname, resource, secret, vacuum, continent, server_address = null) {
    this.vacuum = vacuum;
    this.vacuum_status = null;
    this.clean_status = null;
    this.deebot_position = {
      x: null,
      y: null,
      a: null,
      invalid: 0
    };
    this.charge_position = {
      x: null,
      y: null,
      a: null
    };
    this.fan_speed = null;
    this.charge_status = null;
    this.battery_status = null;
    this.water_level = null;
    this.waterbox_info = null;
    this.components = {};
    this.ping_interval = null;
    this.error_event = null;
    this.ecovacs = null;
    this.useMqtt = (vacuum['company'] === 'eco-ng') ? true : false;
    this.deviceClass = vacuum['class'];

    if (!this.useMqtt) {
      tools.envLog("[VacBot] Using EcovacsXMPP");
      const EcovacsXMPP = require('./ecovacsXMPP.js');
      this.ecovacs = new EcovacsXMPP(this, user, hostname, resource, secret, continent, vacuum, server_address);
    } else {
      tools.envLog("[VacBot] Using EcovacsIOTMQ");
      const EcovacsMQTT = require('./ecovacsMQTT.js');
      this.ecovacs = new EcovacsMQTT(this, user, hostname, resource, secret, continent, vacuum, server_address);
    }

    this.ecovacs.on("ready", () => {
      tools.envLog("[VacBot] Ready event!");
      this.run('GetBatteryState');
      this.run('GetCleanState');
      this.run('GetChargeState');
      if (this.hasMainBrush()) {
        this.run('GetLifeSpan', 'main_brush');
      }
      this.run('GetLifeSpan', 'side_brush');
      this.run('GetLifeSpan', 'filter');
      if (this.hasMoppingSystem()) {
        this.run('GetWaterLevel');
      }
    });
  }

  isOzmo950() {
    return false;
  }

  isSupportedDevice() {
    const devices = JSON.parse(JSON.stringify(tools.getSupportedDevices()));
    return devices.hasOwnProperty(this.deviceClass);
  }

  isKnownDevice() {
    const devices = JSON.parse(JSON.stringify(tools.getKnownDevices()));
    return devices.hasOwnProperty(this.deviceClass) || this.isSupportedDevice();
  }

  getDeviceProperty(property) {
    const devices = JSON.parse(JSON.stringify(tools.getAllKnownDevices()));
    if (devices.hasOwnProperty(this.deviceClass)) {
      const device = devices[this.deviceClass];
      if (device.hasOwnProperty(property)) {
        return device[property];
      }
    }
    return false;
  }

  hasMainBrush() {
    return this.getDeviceProperty('main_brush');
  }

  hasSpotAreas() {
    return this.getDeviceProperty('spot_area');
  }

  hasCustomAreas() {
    return this.getDeviceProperty('custom_area');
  }

  hasMoppingSystem() {
    return this.getDeviceProperty('mopping_system');
  }

  hasVoiceReports() {
    return this.getDeviceProperty('voice_report');
  }

  connect_and_wait_until_ready() {
    this.ecovacs.connect_and_wait_until_ready();
    this.ping_interval = setInterval(() => {
      this.ecovacs.send_ping(this._vacuum_address());
    }, 30000);
  }

  on(name, func) {
    this.ecovacs.on(name, func);
  }

  _handle_life_span(event) {
    let type = null;
    if (event.hasOwnProperty('type')) {
      type = dictionary.COMPONENT_FROM_ECOVACS[event['type']];
    }

    if (!type) {
      console.error("[VacBot] Unknown component type: ", event);
      return;
    }

    let lifespan = null;
    if ((event.hasOwnProperty('val')) && (event.hasOwnProperty('total'))) {
      lifespan = parseInt(event['val']) / parseInt(event['total']) * 100;
    } else if (event.hasOwnProperty('val')) {
      lifespan = parseInt(event['val']) / 100;
    } else if (event.hasOwnProperty('left') && (event.hasOwnProperty('total'))) {
      lifespan = parseInt(event['left']) / parseInt(event['total']) * 100; // This works e.g. for a Ozmo 930
    } else if (event.hasOwnProperty('left')) {
      lifespan = parseInt(event['left']) / 60; // This works e.g. for a D901
    }
    if (lifespan) {
      tools.envLog("[VacBot] lifespan %s: %s", type, lifespan);
      this.components[type] = lifespan;
    }
    tools.envLog("[VacBot] lifespan components: ", JSON.stringify(this.components));
  }

  _handle_deebot_position(event) {
        if (event) {
          tools.envLog("[VacBot] _handle_deebot_position currently not supported for this model");
        } else {
          console.error("[VacBot] _handle_deebot_position event undefined");
        }
  }

  _handle_clean_report(event) {
    this.vacuum_status = 'unknown';

    if (event.attrs) {
      let type = event.attrs['type'];
      if (dictionary.CLEAN_MODE_FROM_ECOVACS[type]) {
        type = dictionary.CLEAN_MODE_FROM_ECOVACS[type];
      }
      let statustype = null;
      if (event.attrs['st']) {
        statustype = dictionary.CLEAN_ACTION_FROM_ECOVACS[event.attrs['st']];
      }
      else if (event.attrs['act']) {
        statustype = dictionary.CLEAN_ACTION_FROM_ECOVACS[event.attrs['act']];
      }
      if (statustype === 'stop' || statustype === 'pause') {
        type = statustype
      }
      this.clean_status = type;
      this.vacuum_status = type;
      tools.envLog("[VacBot] *** clean_status = " + this.clean_status);

      if (event.attrs.hasOwnProperty('speed')) {
        let fan = event.attrs['speed'];
        if (dictionary.FAN_SPEED_FROM_ECOVACS[fan]) {
          fan = dictionary.FAN_SPEED_FROM_ECOVACS[fan];
          this.fan_speed = fan;
          tools.envLog("[VacBot] fan speed: ", fan);
        } else {
          tools.envLog("[VacBot] Unknown fan speed: ", fan);
        }
      } else {
        tools.envLog("[VacBot] couldn't parse clean report ", event);
      }
    }
    this.clean_status = this.vacuum_status;
  }

  _handle_battery_info(event) {
    let value = null;
    if (event.hasOwnProperty('ctl')) {
      value = event['ctl']['battery']['power'];
    } else {
      value = parseFloat(event.attrs['power']);
    }
    try {
      this.battery_status = value;
      tools.envLog("[VacBot] *** battery_status = %d\%", this.battery_status);
    } catch (e) {
      console.error("[VacBot] couldn't parse battery status ", event);
    }
  }

  _handle_water_level(event) {
    this.water_level = event.attrs['v'];
    tools.envLog("[VacBot] *** water_level = " + dictionary.WATER_LEVEL_FROM_ECOVACS[this.water_level] + " (" + this.water_level + ")");
  }

  _handle_waterbox_info(event) {
    this.waterbox_info = event.attrs['on'];
    tools.envLog("[VacBot] *** waterbox_info = " + this.waterbox_info);
  }

  _handle_charge_state(event) {
    if (event.attrs) {
      let report = event.attrs['type'];
      switch (report.toLowerCase()) {
        case "going":
          this.charge_status = 'returning';
          break;
        case "slotcharging":
          this.charge_status = 'charging';
          break;
        case "idle":
          this.charge_status = 'idle';
          break;
        default:
          this.charge_status = 'unknown';
          console.error("[VacBot] Unknown charging status '%s'", report);
          break;
      }
      tools.envLog("[VacBot] *** charge_status = " + this.charge_status)
    } else {
      console.error("[VacBot] couldn't parse charge status ", event);
    }
  }

  _handle_error(event) {
    let errorCode = null;
    if (event.hasOwnProperty('errno')) {
      if (errorCodes[event['errno']]) {
        // NoError: Robot is operational
        if (event['errno'] == '100') {
          return;
        }
        errorCode = errorCodes[event['errno']];
      }
    }
    if ((!errorCode) && (event.hasOwnProperty('error'))) {
      errorCode = event['error'];
    }
    if ((!errorCode) && (event.hasOwnProperty('errs'))) {
      errorCode = event['errs'];
    }
    if (errorCode) {
      this.error_event = errorCode;
    }
  }

  _vacuum_address() {
    if (!this.useMqtt) {
      return this.vacuum['did'] + '@' + this.vacuum['class'] + '.ecorobot.net/atom';
    } else {
      return this.vacuum['did'];
    }
  }

  send_command(action) {
    tools.envLog("[VacBot] Sending command `%s`", action.name);
    if (!this.useMqtt) {
      this.ecovacs.send_command(action.to_xml(), this._vacuum_address());
    } else {
      // IOTMQ issues commands via RestAPI, and listens on MQTT for status updates
      // IOTMQ devices need the full action for additional parsing
      this.ecovacs.send_command(action, this._vacuum_address());
    }
  }

  send_ping() {
    try {
      if (!this.useMqtt) {
        this.ecovacs.send_ping(this._vacuum_address());
      } else if (this.useMqtt) {
        if (!this.ecovacs.send_ping()) {
          throw new Error("Ping did not reach VacBot");
        }
      }
    } catch (e) {
      throw new Error("Ping did not reach VacBot");
    }
  }

  run(action) {
    tools.envLog("[VacBot] action: %s", action);

    switch (action.toLowerCase()) {
      case "clean":
        if (arguments.length <= 1) {
          this.send_command(new vacBotCommand.Clean());
        } else if (arguments.length === 2) {
          this.send_command(new vacBotCommand.Clean(arguments[1]));
        } else {
          this.send_command(new vacBotCommand.Clean(arguments[1], arguments[2]));
        }
        break;
      case "edge":
        this.send_command(new vacBotCommand.Edge());
        break;
      case "spot":
        this.send_command(new vacBotCommand.Spot());
        break;
      case "spotarea":
        if (arguments.length < 3) {
          return;
        }
        this.send_command(new vacBotCommand.SpotArea(arguments[1], arguments[2]));
        break;
      case "customarea":
        if (arguments.length < 4) {
          return;
        }
        this.send_command(new vacBotCommand.CustomArea(arguments[1], arguments[2], arguments[3]));
        break;
      case "stop":
        this.send_command(new vacBotCommand.Stop());
        break;
      case "pause":
        this.send_command(new vacBotCommand.Pause());
        break;
      case "resume":
        this.send_command(new vacBotCommand.Resume());
        break;
      case "charge":
        this.send_command(new vacBotCommand.Charge());
        break;
      case "playsound":
        this.send_command(new vacBotCommand.PlaySound());
        break;
      case "getdeviceinfo":
      case "deviceinfo":
        this.send_command(new vacBotCommand.GetDeviceInfo());
        break;
      case "getcleanstate":
      case "cleanstate":
        this.send_command(new vacBotCommand.GetCleanState());
        break;
      case "getcleanspeed":
      case "cleanspeed":
        this.send_command(new vacBotCommand.GetCleanSpeed());
        break;
      case "getchargestate":
      case "chargestate":
        this.send_command(new vacBotCommand.GetChargeState());
        break;
      case "getbatterystate":
      case "batterystate":
        this.send_command(new vacBotCommand.GetBatteryState());
        break;
      case "getlifespan":
      case "lifespan":
        if (arguments.length < 2) {
          return;
        }
        let component = arguments[1];
        this.send_command(new vacBotCommand.GetLifeSpan(component));
        break;
      case "getwaterlevel":
        this.send_command(new vacBotCommand.GetWaterLevel());
        break;
      case "setwaterlevel":
        if (arguments.length < 2) {
          return;
        }
        this.send_command(new vacBotCommand.SetWaterLevel(arguments[1]));
        break;
      case "getwaterboxinfo":
        this.send_command(new vacBotCommand.GetWaterBoxInfo());
        break;
    }
  }

  disconnect() {
    this.ecovacs.disconnect();
  }
}

module.exports = VacBot_non950type;