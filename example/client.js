'use strict';

const ecovacsDeebot = require('./../index');
const EcoVacsAPI = ecovacsDeebot.EcoVacsAPI;
const nodeMachineId = require('node-machine-id');

const process = require('process');

const account_id = process.env.ECOVACS_EMAIL;
const password = process.env.ECOVACS_PASSWORD;

const deviceID = 0;

const countryCode = "us";
const device_id = EcoVacsAPI.getDeviceId(nodeMachineId.machineIdSync(), deviceID);
const continent = ecovacsDeebot.countries[countryCode.toUpperCase()].continent.toLowerCase();

const authDomain = '';

let api = new EcoVacsAPI(device_id, countryCode, continent, authDomain);

const password_hash = EcoVacsAPI.md5(password);

api.connect(account_id, password_hash).then(() => {

    api.devices().then((devices) => {
        console.log("Devices:", JSON.stringify(devices));

        let vacuum = devices[deviceID];
        let vacbot = api.getVacBot(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, vacuum, continent);

        vacbot.on("ready", (event) => {
            api.logInfo("vacbot ready");
            console.log("vacbot ready");

            vacbot.run("GetBatteryState");
            vacbot.run("GetCleanState");
            vacbot.run("GetChargeState");

            vacbot.on("BatteryInfo", (battery) => {
                console.log("Battery level: " + Math.round(battery));
            });
            vacbot.on('CleanReport', (value) => {
                console.log("Clean status: " + value);
            });
            vacbot.on('ChargeState', (value) => {
                console.log("Charge status: " + value);
            });
        });

        vacbot.connect();

        process.on('SIGINT', function () {
            api.logInfo('\nGracefully shutting down from SIGINT (Ctrl+C)');
            disconnect();
        });

        function disconnect() {
            (async () => {
              try {
                await vacbot.disconnectAsync();
                api.logEvent("Exiting...");
                process.exit();
              } catch (e) {
                api.logError('Failure in disconnecting: ', e.message);
              }
            })();
          }

    });
}).catch((e) => {
    console.error(`Failure in connecting: ${e.message}`);
});