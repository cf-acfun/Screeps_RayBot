export const roleScoreCollector = {
    run: function (creep) {
        // 查找当前房间中的得分容器
        var containers = creep.room.find(FIND_SCORE_CONTAINERS);

        // 如果creep的存储空间还有空余，则收集分数
        if (creep.store.getFreeCapacity(RESOURCE_SCORE) > 0) {
            // 从最近的得分容器中收集分数
            let target = creep.pos.findClosestByPath(containers);
            if (creep.withdraw(target, RESOURCE_SCORE) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target);
            }
        } else {
            // 如果creep的存储空间已满，则将分数转移到存储设施中
            let storage = Game.getObjectById(creep.room.storage);
            if (storage) {
                if (creep.transfer(storage, RESOURCE_SCORE) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(storage);
                }
            }
        }
    }
};