import App from "@/App";
import { Role } from "@/common/Constant";
import { State } from "@/fsm/state";
import Singleton from "@/Singleton";


export default class MoveTo extends Singleton {
    public run(creep: Creep) {
        let roomFrom = creep.memory.roomFrom;
        switch (creep.memory.role) {
            case Role.Harvester: {
                let target: RoomPosition;
                if (creep.memory.targetMineral) {
                    target = creep.room.memory.mineral.harvestPos;
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
                // 没有视野就先过去再插旗子
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
                if (!Game.getObjectById(sourceMem.container)) {
                    if (creep.store.energy >= 48) {
                        if (!structures.length) {
                            let sites = creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, creep.pos);
                            if (sites.length) creep.build(sites[0]);
                            else creep.room.createConstructionSite(creep.pos.x, creep.pos.y, STRUCTURE_CONTAINER);
                        } else sourceMem.container = structures[0].id as Id<StructureContainer>;
                    } else creep.harvest(target);
                } else {
                    let container = Game.getObjectById(sourceMem.container);
                    if (creep.store.energy >= 50 && container.hits / container.hitsMax < 1) creep.repair(container);
                    else creep.harvest(target);
                }
                break;
            }
            case Role.RemoteCarryer: {
                let targetRoom = creep.memory.outSourceRoom;
                if (creep.room.name != targetRoom) {
                    creep.customMove(new RoomPosition(25, 25, targetRoom));
                    return;
                }


                if (creep.store.getFreeCapacity() > 0) {
                    const container = Game.getObjectById(creep.memory.targetContainer);
                    if (container) {
                        if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                            creep.customMove(container.pos);
                            return;
                        }
                    }
                } else {
                    App.fsm.changeState(creep, State.Back);
                    return;
                }

                break;
            }
            case Role.Reserver: {
                // 没有视野就先过去
                let targetRoom = creep.name.split('_')[1];
                if (creep.room.name != targetRoom) {
                    creep.customMove(new RoomPosition(25, 25, targetRoom));
                    return;
                }

                // TODO 待优化开采双矿, 增加挖运分离
                let sourceFlag = Game.flags[creep.name];
                if (sourceFlag) {
                    if (creep.pos.roomName == sourceFlag.pos.roomName) {
                        if (creep.room.controller && !creep.room.controller.my) {
                            if (creep.reserveController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                                creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
                            }
                        }
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
            case Role.RemoteCarryer:
            case Role.OutHarvester: {
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
        }
    }
}