const express = require('express');
const router = express.Router();
const ReportsController = require('../controllers/ReportsController');

// Static sub-paths first — otherwise '/:id' below would swallow them
router.get('/schedules', ReportsController.getSchedules);
router.put('/schedules/:frequency', ReportsController.updateSchedule);
router.post('/send-whatsapp', ReportsController.sendDailyReportWhatsApp);

router.post('/', ReportsController.createReport);
router.get('/', ReportsController.listReports);
router.get('/:id', ReportsController.getReport);
router.put('/:id', ReportsController.updateReport);
router.delete('/:id', ReportsController.deleteReport);

module.exports = router;
