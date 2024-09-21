import App from "@/App";
import Singleton from "@/Singleton";


export default class ScoreController extends Singleton {
    public harvestScore(creep: Creep) {

        // 查找当前房间中的得分容器
        let containers = creep.room.find(FIND_SCORE_CONTAINERS);

        // 如果creep的存储空间还有空余，则收集分数
        if (creep.store.getFreeCapacity(RESOURCE_SCORE) > 0 && containers.length) {
            // 从最近的得分容器中收集分数
            if (creep.withdraw(containers[0] as Structure<StructureConstant>, RESOURCE_SCORE) === ERR_NOT_IN_RANGE) {
                creep.moveTo(containers[0]);
            }
        } else {
            if (creep.transfer(creep.room.storage, RESOURCE_SCORE) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.storage);
            }
        }
    }

    public transferScore(creep: Creep) {
        // 获取当前房间storage中的分数
        if (creep.store.getFreeCapacity() > 0) {
            if (creep.withdraw(creep.room.storage, RESOURCE_SCORE) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.storage);
                return;
            }
        }
        // 从房间中获取当前房间提交分数目标房间（手动配置，待优化为自动查找中央房间分数收集器）
        if (!Game.rooms[creep.memory.roomFrom].memory.submitScoreRoom) Game.rooms[creep.memory.roomFrom].memory.submitScoreRoom = null;
        let targetRoom = Game.rooms[creep.memory.roomFrom].memory.submitScoreRoom;
        
        if (targetRoom) {
            if (creep.room.name != targetRoom) {
                creep.customMove(new RoomPosition(25, 25, targetRoom));
                return;
            }
            let scoreCollector = creep.room.find(FIND_SCORE_COLLECTORS);
            
            if (scoreCollector) {
                if(creep.transfer(scoreCollector[0] as Structure<StructureConstant>, RESOURCE_SCORE) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(scoreCollector[0]);
                }
            }
        }

    }


}