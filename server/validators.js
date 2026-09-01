const { body, param, query } = require('express-validator');

// Param validators
const idParam = (name = 'id') => param(name).isInt({ min: 1 }).toInt();
const optionalDateQuery = query('date').optional().isISO8601();

// Body validators
const weightBody = [ body('weight').isFloat({ min: 1, max: 500 }), body('date').optional().isISO8601() ];

const measurementBody = [
  body('date').optional().isISO8601(),
  body('waist').optional().isFloat({ min: 0, max: 500 }),
  body('chest').optional().isFloat({ min: 0, max: 500 }),
  body('arms').optional().isFloat({ min: 0, max: 500 }),
  body('thighs').optional().isFloat({ min: 0, max: 500 }),
  body('hips').optional().isFloat({ min: 0, max: 500 }),
  body('shoulders').optional().isFloat({ min: 0, max: 500 }),
  body('notes').optional().isString().isLength({ max: 1000 })
];

const sessionCreate = [
  body('name').trim().notEmpty().isLength({ max: 255 }),
  body('notes').optional().isString().isLength({ max: 2000 }),
  body('exercises').optional().isArray()
];

const sessionUpdate = [
  idParam('id'),
  body('name').optional().trim().isLength({ max: 255 }),
  body('notes').optional().isString().isLength({ max: 2000 }),
  body('exercises').optional().isArray()
];

const exerciseUpdate = [ param('exId').isInt({ min: 1 }).toInt(), body('done').optional().isBoolean(), body('default_weight').optional().isFloat({ min: 0, max: 10000 }) ];

const setUpdate = [ param('setId').isInt({ min: 1 }).toInt(), body('weight').optional().isFloat({ min: 0 }), body('reps').optional().isInt({ min: 0 }), body('done').optional().isBoolean(), body('target_reps').optional().isString(), body('target_weight').optional().isFloat({ min: 0 }) ];

const libraryCreate = [ body('name').trim().notEmpty().isLength({ max: 255 }), body('muscle_group').optional().isString().isLength({ max: 100 }), body('category').optional().isString().isLength({ max: 100 }) ];

const recipeCreate = [
  body('name').trim().notEmpty().isLength({ max: 255 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('ingredients').isArray({ min: 1 })
];

module.exports = {
  idParam,
  optionalDateQuery,
  weightBody,
  measurementBody,
  sessionCreate,
  sessionUpdate,
  exerciseUpdate,
  setUpdate,
  libraryCreate,
  recipeCreate
};
