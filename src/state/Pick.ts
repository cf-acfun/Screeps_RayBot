import App from "@/App";
import { Role } from "@/common/Constant";
import { State } from "@/fsm/state";
import Singleton from "@/Singleton";

export default class Pick extends Singleton {
    public run(creep: Creep) {
        switch (creep.memory.role) {
            case Role.Carrier: {
                if (creep.room.name != creep.memory.roomFrom) {
                    creep.customMove(new RoomPosition(25, 25, creep.memory.roomFrom));
                    return;
                }
                // 查找当前房间中的得分容器
                let containers = creep.room.find(FIND_SCORE_CONTAINERS);

                // 如果creep的存储空间还有空余，则收集分数
                if (creep.store.getFreeCapacity(RESOURCE_SCORE) > 0 && containers.length) {
                    // 如果有能量则先将能量转运到storage中
                    if (creep.room.storage && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                        if (creep.transfer(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                            creep.moveTo(creep.room.storage);
                            return;
                        }
                    }
                    // 从最近的得分容器中收集分数
                    if (creep.withdraw(containers[0] as Structure<StructureConstant>, RESOURCE_SCORE) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(containers[0]);
                        return;
                    }
                } else if (containers.length) {
                    if (creep.transfer(creep.room.storage, RESOURCE_SCORE) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.storage);
                        return;
                    }
                }
                if (creep.memory.targetContainer == creep.room.memory.mineral.container) {
                    App.fsm.changeState(creep, State.Withdraw);
                    return;
                }
                if (!creep.memory.dropId) {
                    let drop = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                        filter: (d) => d.amount >= 100 && d.resourceType == 'energy'
                    })
                    if (drop) creep.memory.dropId = drop.id;
                    else App.fsm.changeState(creep, State.Withdraw);
                } else {
                    let drop = Game.getObjectById(creep.memory.dropId);
                    if (drop) {
                        if (creep.pickup(drop) == ERR_NOT_IN_RANGE) {
                            creep.customMove(drop.pos);
                        }
                    } else creep.memory.dropId = null;
                }
                if (creep.store.getFreeCapacity() == 0) {
                    App.fsm.changeState(creep, State.TransferToSpawn);
                }
                break;
            }
            case Role.HelpUpgrader:
            case Role.HelpBuilder: {
                if (creep.store.getFreeCapacity() == 0) {
                    App.fsm.changeState(creep, State.Build);
                    return;
                }
                if (!creep.memory.dropId) {
                    let drop = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                        filter: (d) => d.amount >= 100 && d.resourceType == 'energy'
                    })
                    if (drop) creep.memory.dropId = drop.id;
                    else {
                        if (creep.room.storage?.store.energy) {
                            App.common.getResourceFromTargetStructure(creep, creep.room.storage);
                            return;
                        }
                        App.fsm.changeState(creep, State.Harvest);
                    }
                } else {
                    let drop = Game.getObjectById(creep.memory.dropId);
                    if (drop) {
                        if (creep.pickup(drop) == ERR_NOT_IN_RANGE) {
                            creep.customMove(drop.pos);
                        }
                    } else creep.memory.dropId = null;
                }
                break;
            }
        }
    }
}