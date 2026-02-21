'use strict';

const { Router } = require('express');
const { getJobStatus, cancelJob, getQueueStats } = require('../controllers/jobs.controller');

const router = Router();

// Get queue statistics
router.get('/stats', getQueueStats);

// Get job status
router.get('/:id', getJobStatus);

// Cancel a job
router.post('/:id/cancel', cancelJob);

module.exports = router;
