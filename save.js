/**
 * game-hub 公共存档模块
 * 统一 localStorage 封装，key 格式：game-hub:<gameId>:v1
 *
 * 约定：每个游戏的存档对象顶层需包含
 *   best: number | null    最佳表现（数值越小越好；water-sort=最短步数，sudoku=最快用时秒）
 *   completed: number      已通关的关卡数
 * 大厅页 (index.html) 读取这两个字段展示纪录。
 */
(function () {
  "use strict";

  var PREFIX = "game-hub:";
  var VER = "v1";

  function key(gameId) {
    return PREFIX + gameId + ":" + VER;
  }

  var GameSave = {
    /** 读存档，与 defaults 合并（defaults 提供字段缺省值） */
    load: function (gameId, defaults) {
      var base = defaults || {};
      try {
        var raw = localStorage.getItem(key(gameId));
        if (!raw) return base;
        var parsed = JSON.parse(raw);
        return Object.assign({}, base, parsed);
      } catch (e) {
        console.warn("[GameSave] load failed for " + gameId, e);
        return base;
      }
    },

    /** 写存档，返回是否成功 */
    save: function (gameId, data) {
      try {
        localStorage.setItem(key(gameId), JSON.stringify(data));
        return true;
      } catch (e) {
        console.warn("[GameSave] save failed for " + gameId, e);
        return false;
      }
    },

    /** 清空某游戏存档 */
    clear: function (gameId) {
      try { localStorage.removeItem(key(gameId)); } catch (e) {}
    }
  };

  window.GameSave = GameSave;
})();
