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

}