import os from 'node:os';

/**
 * Returns all active non-internal IPv4 addresses on the host machine
 * so mobile devices on the same Wi-Fi/LAN can connect directly.
 */
export function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const [name, nets] of Object.entries(interfaces)) {
    if (!Array.isArray(nets)) continue;
    for (const net of nets) {
      const familyV4 = net.family === 'IPv4' || net.family === 4;
      if (familyV4 && !net.internal) {
        addresses.push({
          interface: name,
          address: net.address,
        });
      }
    }
  }

  return addresses;
}
