'use strict';

const { ERROR_CODES } = require('../utils/constants');

/**
 * Joi validation middleware factory
 * @param {import('joi').Schema} schema - Joi schema
 * @param {'body'|'query'|'params'} source - Request property to validate
 */
function validate(schema, source = 'body') {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[source], {
            abortEarly: false,
            stripUnknown: true,
            allowUnknown: false,
        });

        if (error) {
            const details = error.details.map((d) => ({
                field: d.path.join('.'),
                message: d.message.replace(/"/g, ''),
            }));

            return res.status(400).json({
                success: false,
                error: {
                    code: ERROR_CODES.VALIDATION_ERROR,
                    message: 'Validation failed',
                    details,
                },
            });
        }

        // Replace with validated & sanitized values
        req[source] = value;
        next();
    };
}

module.exports = { validate };
