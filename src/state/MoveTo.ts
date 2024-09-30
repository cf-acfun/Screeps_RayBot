import App from "@/App";
import { Role } from "@/common/Constant";
import { State } from "@/fsm/state";
import Singleton from "@/Singleton";
import { GenNonDuplicateID } from "@/common/utils";


export default class MoveTo extends Singleton {
    public run(creep: Creep) {
        let roomFrom = creep.memory.roomFrom;
        switch (creep.memory.role) {
            case Role.Harvester: {
                let target: RoomPosition;
                if (creep.memory.targetMineral) {
                    if (creep.room.name != creep.memory.roomFrom) {
                        target = new RoomPosition(creep.memory.moveTarget.x, creep.memory.moveTarget.y, creep.memory.moveTarget.roomName);
                    } else {
                        target = creep.room.memory.mineral.harvestPos;
                    }
                    creep.customMove(target, 0);
                } else if (creep.memory.targetSource) {
                    target = creep.room.memory.sources[creep.memory.targetSource].harvestPos;
                    creep.customMove(target, 0);
                }
                if (target) {
                    if (App.common.getDis(creep.pos, target) == 1) {
                        let other = creep.room.lookForAt(LOOK_CREEPS, target);
                        if (other.length) other[0].suicide();
                    }
                    if (App.common.isPosEqual(creep.pos, target)) {
                        App.common.setTime(creep);
                        App.fsm.changeState(creep, State.Harvest)
                    }
                }
                break;
            }
            case Role.Claimer: {
                let target = Game.flags[`${roomFrom}_claim`];
                let atkClaim = Game.flags[`${roomFrom}_atkClaim`];
                let reserveFlag = Game.flags[`${roomFrom}_reserve`];
                let transfer = Game.flags[`${roomFrom}_ts`];
                if (transfer && !creep.memory.transferState) {
                    if (creep.room.name != transfer.pos.roomName) {
                        creep.customMove(transfer.pos);
                        return
                    } else {
                        creep.memory.transferState = true;
                    }
                }
                if (atkClaim) {
                    if (creep.room.name != atkClaim.pos.roomName) {
                        creep.customMove(atkClaim.pos);
                        return;
                    }
                    if (creep.attackController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        creep.customMove(atkClaim.pos);
                    }
                    if (!creep.room.controller.reservation?.username) {
                        atkClaim.remove();
                        global.cc[creep.memory.roomFrom].claimer = 0;
                    }
                    return;
                }
                if (reserveFlag) {
                    console.log(`time = [${Game.time}]开始进行预定 creep.room.name = [${creep.room.name}] reserveFlag.pos.roomName = [${reserveFlag.pos.roomName}]`);

                    if (creep.room.name != reserveFlag.pos.roomName) {
                        console.log(`move`);
                        creep.customMove(reserveFlag.pos);
                        return;
                    }
                    if (creep.reserveController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        creep.customMove(reserveFlag.pos);
                    }
                    return;
                }
                if (target) {
                    if (creep.room.name != target.pos.roomName) {
                        creep.customMove(target.pos);
                        return
                    }
                    if (creep.room.controller.reservation && creep.room.controller.reservation.username != Memory.username) {
                        if (creep.reserveController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                            creep.customMove(creep.room.controller.pos);
                            return;
                        }
                    }
                    if (creep.claimController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        creep.customMove(creep.room.controller.pos);
                    }
                    if (creep.room.name == target.pos.roomName && creep.room.controller.owner?.username == creep.owner.username) {
                        global.cc[creep.memory.roomFrom].claimer = 0;
                        creep.signController(creep.room.controller, creep.room.name);
                        App.common.getSources(creep.room.name);
                        App.common.getMineral(creep.room.name);
                        App.init.getRooms();
                        global.cc[roomFrom].claimer = 0;
                        target.remove();
                    }
                } else {
                    global.state = false;
                    creep.suicide();
                }
                break;
            }
            case Role.HelpUpgrader:
            case Role.HelpBuilder: {
                let transfer = Game.flags[`${roomFrom}_ts`];
                if (transfer && !creep.memory.transferState) {
                    if (creep.room.name != transfer.pos.roomName) {
                        creep.customMove(transfer.pos);
                        return
                    } else {
                        creep.memory.transferState = true;
                    }
                }
                let target;
                if (creep.memory.role == Role.HelpBuilder) target = Game.flags[`${roomFrom}_helpBuild`];
                if (creep.memory.role == Role.HelpUpgrader) target = Game.flags[`${roomFrom}_helpUpgrade`];
                if (target) {
                    creep.customMove(target.pos, 0);
                    if (App.common.isPosEqual(target.pos, creep.pos)) App.fsm.changeState(creep, State.Withdraw);
                }
                break;
            }
            case Role.Attacker: {
                let target = Game.flags[`${roomFrom}_attack`];
                if (target) {
                    creep.customMove(target.pos);
                    if (creep.room.name == target?.room.name) {
                        let structure = creep.room.lookForAt(LOOK_STRUCTURES, target);
                        if (structure.length) creep.attack(structure[0]);
                        else target.remove();
                    }
                }
                break;
            }
            case Role.RemoteTransfer: {
                let task = Memory.roomTask[roomFrom][creep.memory.taskId];
                if (!task) return;
                if (creep.store.getUsedCapacity() == 0) {
                    if (creep.room.name != task.targetRoom) creep.customMove(new RoomPosition(25, 25, task.targetRoom));
                    else {
                        let targets = creep.room.find(FIND_STRUCTURES, {
                            filter: s => s.structureType == task.targetStructure
                        })
                        if (targets.length) {
                            if (task.operate == 'withdraw') {
                                if (targets[0]['store'][task.targetRes] == 0) {
                                    delete Memory.roomTask[roomFrom][creep.memory.taskId];
                                    global.cc[roomFrom].remoteTransfer = 0;
                                }
                                if (creep.store.getFreeCapacity() == 0) {
                                    App.fsm.changeState(creep, State.Back);
                                    return;
                                }
                                if (creep.withdraw(targets[0], task.targetRes) == ERR_NOT_IN_RANGE) {
                                    creep.customMove(targets[0].pos);
                                }
                            }
                        }
                    }
                }
                if (task.operate == 'withdraw') {
                    if (creep.store.getFreeCapacity() == 0) {
                        App.fsm.changeState(creep, State.Back);
                        return;
                    }
                }
                break;
            }
            case Role.DepositHarvester: {
                let df = Game.flags[creep.name];
                if (df) {
                    if (creep.store.getFreeCapacity() == 0) {
                        App.fsm.changeState(creep, State.Back);
                        let d = creep.room.lookForAt(LOOK_DEPOSITS, df)[0]
                        if (d.lastCooldown >= 100) {
                            df.remove();
                            return;
                        }
                        return;
                    }
                    if (creep.pos.roomName == df.pos.roomName) {
                        let d = creep.room.lookForAt(LOOK_DEPOSITS, df)[0]
                        if (d) {
                            if (creep.harvest(d) == ERR_NOT_IN_RANGE) {
                                // 检测是否有其他玩家爬
                                // if (Math.max(Math.abs(creep.pos.x - d.pos.x), Math.abs(creep.pos.y - d.pos.y)) <= 2) {
                                //   let hostile = creep.room.find(FIND_HOSTILE_CREEPS, {
                                //     filter: c => Math.abs(c.pos.x - creep.pos.x) <= 2 && Math.abs(c.pos.y - creep.pos.y) <= 2 && !whiteList.includes(c.owner.username)
                                //   })[0]
                                //   if (hostile) {
                                //     if (creep.attack(hostile) == ERR_NOT_IN_RANGE) {
                                //       creep.customMove(d.pos);
                                //       return;
                                //     }
                                //   } else 
                                //   creep.customMove(d.pos);
                                // } else 
                                creep.customMove(d.pos);
                            }
                            // 记录单程抵达时间
                            if (!creep.memory.time) {
                                let pos1 = creep.pos;
                                let pos2 = df.pos;
                                if ((Math.abs(pos1.x - pos2.x) <= 1) && (Math.abs(pos1.y - pos2.y) <= 1)) {
                                    creep.memory.time = 1500 - creep.ticksToLive;
                                }
                            }
                            if (creep.store.getFreeCapacity() == 0 ||
                                creep.ticksToLive < creep.memory.time + 50) {
                                App.fsm.changeState(creep, State.Back);
                                if (d.lastCooldown > 100) {
                                    df.remove();
                                    return;
                                }
                            }
                        } else {
                            df.remove();
                            return;
                        }
                    } else {
                        creep.customMove(df.pos);
                    }
                }
                break;
            }
            case Role.OutHarvester: {

                // 不在外矿房间则先移动到外矿房间
                let targetRoom = creep.memory.outSourceRoom;
                if (creep.room.name != targetRoom) {
                    creep.customMove(new RoomPosition(25, 25, targetRoom));
                    return;
                }
                // 从内存中读取矿点信息
                let target = Game.getObjectById(creep.memory.targetSource);
                let sourceMem = Game.rooms[creep.memory.roomFrom].memory.outSourceRooms[creep.memory.outSourceRoom][target.id];
                let structures = creep.room.lookForAt(LOOK_STRUCTURES, creep.pos).filter(e => e.structureType == STRUCTURE_CONTAINER);
                if (creep.ticksToLive <= creep.memory.time + creep.body.length * 3) {
                    if (sourceMem.harvester == creep.name) sourceMem.harvester = null;
                }
                if (!creep.memory.targetPos) creep.memory.targetPos = sourceMem.harvestPos;
                if (!Game.getObjectById(sourceMem.container)) {
                    if (creep.store.energy >= 48) {
                        if (!structures.length) {
                            let sites = creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, creep.pos);
                            if (sites.length) creep.build(sites[0]);
                            else creep.room.createConstructionSite(creep.pos.x, creep.pos.y, STRUCTURE_CONTAINER);
                        } else sourceMem.container = structures[0].id as Id<StructureContainer>;
                    } else {
                        if (creep.harvest(target) == ERR_NOT_IN_RANGE) {
                            creep.customMove(creep.memory.targetPos, 0);
                        }
                    }
                } else {
                    let container = Game.getObjectById(sourceMem.container);
                    if (creep.store.energy >= 50 && container.hits / container.hitsMax < 1) {
                        creep.repair(container);
                    } else {
                        if (creep.harvest(target) == ERR_NOT_IN_RANGE) {
                            creep.customMove(creep.memory.targetPos, 0);
                        }
                    }
                }
                break;
            }
            case Role.RemoteCarryer: {
                let targetRoom = creep.memory.outSourceRoom;
                const container = Game.getObjectById(creep.memory.targetContainer);
                if (creep.room.name != targetRoom) {
                    if (container) {
                        creep.customMove(new RoomPosition(container.pos.x, container.pos.y, targetRoom));
                        return;
                    } else {
                        creep.customMove(new RoomPosition(25, 25, targetRoom));
                        return;
                    }
                    
                }

                if (creep.store.getFreeCapacity() > 0) {
                    let drop = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                        filter: (d) => d.amount >= 800 && d.resourceType == 'energy'
                    })
                    if (drop) {
                        if (drop.amount > 2000) {
                            let sourceMem = Game.rooms[creep.memory.roomFrom].memory.outSourceRooms[targetRoom][creep.memory.targetSource];
                            // 绑定外矿搬运者
                            if (!sourceMem.carrier1) {
                                let creepName = GenNonDuplicateID();
                                App.spawn.run(creep.memory.roomFrom, Role.RemoteCarryer, creepName);
                                sourceMem.carrier1 = creepName;
                            }

                            let carrier1 = Game.creeps[sourceMem.carrier1];
                            if (!carrier1) {
                                App.spawn.run(creep.memory.roomFrom, Role.RemoteCarryer, sourceMem.carrier1);
                            }
                            if (carrier1 && !carrier1.memory.targetContainer && sourceMem.container) carrier1.memory.targetContainer = sourceMem.container;
                            if (carrier1 && !carrier1.memory.outSourceRoom) carrier1.memory.outSourceRoom = targetRoom;
                            if (carrier1 && !carrier1.memory.targetSource) carrier1.memory.targetSource = creep.memory.targetSource;
                        }
                        if (creep.pickup(drop) == ERR_NOT_IN_RANGE) {
                            creep.customMove(drop.pos);
                            return;
                        }
                    } else {
                        if (container && container.store[RESOURCE_ENERGY] > 0) {
                            if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                                creep.customMove(container.pos);
                                return;
                            }
                        }
                    }

                } else {
                    App.fsm.changeState(creep, State.Back);
                    return;
                }

                break;
            }
            case Role.RemoteReserver: {

                let targetRoom = Game.rooms[creep.memory.outSourceRoom];

                if (creep.room.name != creep.memory.outSourceRoom) {
                    if (targetRoom) {
                        creep.customMove(new RoomPosition(targetRoom.controller.pos.x, targetRoom.controller.pos.y, targetRoom.name));
                    } else {
                        creep.customMove(new RoomPosition(25, 25, creep.memory.outSourceRoom));
                    }
                    return;
                }

                if (creep.room.name == targetRoom.name) {

                    // TODO 寻找Keeper,增加防御功能
                    // let keeper = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {
                    //     filter: (creep) => {
                    //         return creep.owner.username == 'Source Keeper' || creep.owner.username == 'Invader'
                    //     }
                    // });
                    // if (keeper) {
                    //     console.log(`当前房间[${creep.room.name}] 存在keeper[${keeper.name}]`);
                    // }

                    if (creep.room.controller && !creep.room.controller.my) {
                        if (creep.reserveController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                            creep.customMove(creep.room.controller.pos);
                        }
                    }
                }
                break;
            }
            case Role.Observer: {
                let targetRoom = creep.memory.outSourceRoom;
                if (creep.room.name != targetRoom) {
                    creep.customMove(new RoomPosition(25, 25, targetRoom));
                    return;
                } else {
                    creep.customMove(new RoomPosition(25, 25, targetRoom));
                }
                break;
            }
            case Role.TransferScore2Collector: {

                if (creep.store.getFreeCapacity() > 0 && creep.room.name == creep.memory.roomFrom) {
                    if (creep.withdraw(creep.room.storage, RESOURCE_SCORE) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.storage);
                        return;
                    }
                } else if (creep.store.getFreeCapacity() > 0 && creep.room.name != creep.memory.roomFrom) {
                    creep.memory.state = State.Back;
                    return;
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
                        if (creep.transfer(scoreCollector[0] as Structure<StructureConstant>, RESOURCE_SCORE) === ERR_NOT_IN_RANGE) {
                            creep.moveTo(scoreCollector[0]);
                        }
                    }
                    if (creep.store.getUsedCapacity(RESOURCE_SCORE) == 0) {
                        creep.memory.state = State.Back;
                        return;
                    }
                }
                break;
            }
        }
    }

    public back(creep: Creep) {
        let roomFrom = creep.memory.roomFrom;
        switch (creep.memory.role) {
            case Role.RemoteTransfer: {
                if (creep.store.getUsedCapacity() == 0) {
                    App.fsm.changeState(creep, State.MoveTo);
                    return;
                }
                if (creep.room.name == roomFrom) App.common.transferToTargetStructure(creep, Game.rooms[roomFrom].storage);
                else creep.customMove(new RoomPosition(25, 25, roomFrom));
                break;
            }
            case Role.RemoteCarryer: {
                if (creep.store.getUsedCapacity() == 0) {
                    App.fsm.changeState(creep, State.MoveTo);
                    return;
                }
                if (creep.room.name == roomFrom) {
                    let upgradePlusFlag = Game.flags[`${creep.memory.roomFrom}_upgradePlus`];
                    if (upgradePlusFlag) {
                        let controllerContainers: Id<StructureContainer>[] = creep.room.memory.controllerContainerId;
                        let target: StructureContainer;
                        for (let id of controllerContainers) {
                            let container = Game.getObjectById(id);
                            if (container.store.getFreeCapacity(RESOURCE_ENERGY) >= 500) {
                                target = container;
                                break;
                            }
                        }
                        if (target) {
                            App.common.transferToTargetStructure(creep, target);
                        } else {
                            App.common.transferToTargetStructure(creep, Game.rooms[roomFrom].storage);
                        }
                    } else {
                        App.common.transferToTargetStructure(creep, Game.rooms[roomFrom].storage);
                    }
                } else {
                    creep.customMove(new RoomPosition(25, 25, roomFrom));
                }
                break;
            }
            case Role.DepositHarvester: {
                if (creep.store.getUsedCapacity() == 0) {
                    App.fsm.changeState(creep, State.MoveTo);
                    return;
                }
                if (creep.room.name == roomFrom) App.common.transferToTargetStructure(creep, Game.rooms[roomFrom].storage);
                else creep.customMove(new RoomPosition(25, 25, roomFrom));
                break;
            }
            case Role.TransferScore2Collector: {
                // if (creep.ticksToLive < 100 && creep.store[RESOURCE_SCORE] == 0) {
                //     creep.suicide();
                // }
                if (creep.room.name == roomFrom) {
                    if (creep.withdraw(creep.room.storage, RESOURCE_SCORE) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.storage);
                        return;
                    } else if (creep.withdraw(creep.room.storage, RESOURCE_SCORE) === OK) {
                        creep.memory.state = State.MoveTo;
                    }
                } else {
                    creep.customMove(new RoomPosition(25, 25, roomFrom));
                }
                break;
            }
        }
    }
}