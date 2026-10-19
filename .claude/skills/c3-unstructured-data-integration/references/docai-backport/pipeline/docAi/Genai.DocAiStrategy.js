/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

function scriptSource() {
  var strategy = this.get('scriptRef, pySrcString');

  if (strategy.scriptRef && strategy.scriptRef.url) {
    var content = File.make({ url: strategy.scriptRef.url }).readString();
    if (!content) {
      throw new Error('DocAiStrategy.scriptSource: scriptRef file is empty or unreadable: ' + strategy.scriptRef.url);
    }

    return content;
  }

  if (strategy.pySrcString) {
    return strategy.pySrcString;
  }

  throw new Error(
    'DocAiStrategy.scriptSource: called on an OOTB strategy (id=' + this.id + '); check ootbName instead'
  );
}

function beforeCreate(objs) {
  var errors = ObjError.arrayBuilder();
  var validObjs = [];

  objs.each(function (obj) {
    var hasRef = !!(obj.scriptRef && obj.scriptRef.url);
    var hasSrc = !!obj.pySrcString;
    var hasOotb = !!obj.ootbName;
    var count = (hasRef ? 1 : 0) + (hasSrc ? 1 : 0) + (hasOotb ? 1 : 0);

    if (count !== 1) {
      errors.push(
        ObjError.make({
          targetType: 'Genai.DocAiStrategy',
          targetId: obj.id || '',
          message:
            "DocAiStrategy '" +
            (obj.id || '') +
            "': exactly one of scriptRef, pySrcString, or ootbName must be set (got " +
            count +
            ').',
        })
      );
    } else {
      validObjs.push(obj);
    }
  });

  return {
    objs: validObjs,
    errors: errors.build(),
  };
}
