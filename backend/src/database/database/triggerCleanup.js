const { cleanupRooms } = require('./cleanupRooms');

(async () => {
    console.log('Manually triggering cleanupRooms...');
    await cleanupRooms();
    console.log('Cleanup completed.');
})();