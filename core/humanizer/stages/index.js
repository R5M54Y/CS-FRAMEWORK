'use strict';

const NormalizeStage = require('./NormalizeStage');
const DetectFormattingStage = require('./DetectFormattingStage');
const DetectSectionsStage = require('./DetectSectionsStage');
const DetectStructureStage = require('./DetectStructureStage');
const DecorateStage = require('./DecorateStage');
const SpacingStage = require('./SpacingStage');

module.exports = {
  NormalizeStage,
  DetectFormattingStage,
  DetectSectionsStage,
  DetectStructureStage,
  DecorateStage,
  SpacingStage,
};
