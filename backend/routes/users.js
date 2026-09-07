const express = require('express');
const router = express.Router();
const UsersController = require('../controllers/UsersController');

// Mounted with requireOwner in server.js — every route here is Owner-only.
// /self/password is defined before /:id/password so "self" is never parsed as an id.
router.get('/', UsersController.getAllUsers);
router.post('/', UsersController.createUser);
router.put('/self/password', UsersController.changeOwnPassword);
router.put('/:id', UsersController.updateUser);
router.put('/:id/password', UsersController.setUserPassword);

module.exports = router;
