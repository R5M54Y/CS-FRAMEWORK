'use strict';

const NormalizeStage = require('./NormalizeStage');
const RemoveMarkdownStage = require('./RemoveMarkdownStage');
const DetectFormattingStage = require('./DetectFormattingStage');
const DetectSectionsStage = require('./DetectSectionsStage');
const DetectStructureStage = require('./DetectStructureStage');
const DetectListsStage = require('./DetectListsStage');
const DetectSpecialBlocksStage = require('./DetectSpecialBlocksStage');
const SemanticAnalyzerStage = require('./SemanticAnalyzerStage');
const DecorateStage = require('./DecorateStage');
const ImproveSpacingStage = require('./ImproveSpacingStage');
const SemanticChunkStage = require('./SemanticChunkStage');
const SplitLongMessagesStage = require('./SplitLongMessagesStage');
const FinalNormalizeStage = require('./FinalNormalizeStage');

module.exports = {
  NormalizeStage,
  RemoveMarkdownStage,
  DetectFormattingStage,
  DetectSectionsStage,
  DetectStructureStage,
  DetectListsStage,
  DetectSpecialBlocksStage,
  DecorateStage,
  SemanticAnalyzerStage,
  ImproveSpacingStage,
  SemanticChunkStage,
  SplitLongMessagesStage,
  FinalNormalizeStage,
};
