import App from "@/App";
import { Role } from "@/common/Constant";
import { State } from "@/fsm/state";
import Singleton from "@/Singleton";

export default class Pick extends Singleton {
    public run(creep: Creep) {
        switch (creep.memory.role) {
            case Role.MineralCarrier:
            case Role.Carrier: {
                if (creep.room.name != creep.memory.roomFrom) {
                    creep.customMove(new RoomPosition(25, 25, creep.memory.roomFrom));
                    return;
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
                if (creep.store.getFreeCapacity() == 0) App.fsm.changeState(creep, State.TransferToSpawn);
                break
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
                        // 检查 sourceMem.container 是否有能量
                        let foundContainer = false;
                        if (creep.room.memory.sources) {
                            for (let sourceId in creep.room.memory.sources) {
                                let sourceMem = creep.room.memory.sources[sourceId];
                                if (sourceMem.container) {
                                    let container = Game.getObjectById(sourceMem.container);
                                    if (container && container.store.energy > 0) {
                                        App.common.getResourceFromTargetStructure(creep, container);
                                        foundContainer = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (!foundContainer) {
                            if (creep.room.storage?.store.energy) {
                                App.common.getResourceFromTargetStructure(creep, creep.room.storage);
                                return;
                            }
                            App.fsm.changeState(creep, State.Harvest);
                        }
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