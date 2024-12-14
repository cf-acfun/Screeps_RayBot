import App from "@/App";
import { Role } from "@/common/Constant";
import { State } from "@/fsm/state";
import Singleton from "@/Singleton";
import { inRange } from "lodash";


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
                let transfer = Game.flags[`${roomFrom}_ts`];
                if (transfer && !creep.memory.transferState) {
                    if (creep.pos != transfer.pos) {
                        creep.moveTo(transfer.pos);
                        return;
                    } else {
                        creep.memory.transferState = true;
                    }
                }
                if (atkClaim) {
                    if (creep.room.name != atkClaim.pos.roomName) {
                        creep.customMove(atkClaim.pos);
                        return
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
                if (target) {
                    if (creep.room.name != target.pos.roomName) {
                        creep.moveTo(target.pos);
                        return
                    }
                    if (creep.room.controller.reservation && creep.room.controller.reservation.username != Memory.username) {
                        if (creep.reserveController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(creep.room.controller.pos);
                            return;
                        }
                    }
                    if (creep.claimController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.controller.pos);
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
            case Role.PB_Carryer: {
                let task = Memory.roomTask[roomFrom][creep.memory.taskId];
                // console.log(`当前task[${creep.memory.taskId}], 需要孵化[${global.cc[creep.memory.roomFrom].pb_carryer}]个爬`);
                if (!task) {
                    global.cc[creep.memory.roomFrom].pb_carryer = 0;
                    if (creep.store.getUsedCapacity() == 0 && creep.memory.state != State.Back) {
                        creep.suicide();
                        return;
                    }
                }
                let powerBankFlag = `PB_${creep.memory.roomFrom}_${task.targetRoom}`;
                if (creep.room.name != task.targetRoom) {
                    creep.customMove(new RoomPosition(25, 25, task.targetRoom));
                } else {
                    if (Game.flags[powerBankFlag] && !creep.pos.inRangeTo(Game.flags[powerBankFlag].pos, 4)) {
                        creep.customMove(Game.flags[powerBankFlag].pos);
                        return;
                    }
                    let power = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                        filter: (d) => d.amount >= 10 && d.resourceType == "power"
                    });
                    if (power) {
                        if (creep.pickup(power) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(power.pos);
                            return;
                        }
                    } else if (!Game.flags[powerBankFlag]){
                        console.log(`!Game.flags[powerBankFlag] = [${!Game.flags[powerBankFlag]}]power搬运任务完成,删除任务`);
                        delete Memory.roomTask[creep.memory.roomFrom][creep.memory.taskId];
                    }

                    if (creep.store.getUsedCapacity() > 0) {
                        creep.memory.state = State.Back;
                    }
                }
                break;
            }
            case Role.RemoteTransfer: {
                if (creep.ticksToLive < 200 && creep.store.getUsedCapacity() == 0) {
                    creep.memory.state = State.Back;
                }
                let task = Memory.roomTask[roomFrom][creep.memory.taskId];
                if (!task) return;
                if (creep.store.getFreeCapacity() > 0) {
                    if (creep.room.name != task.targetRoom) creep.customMove(new RoomPosition(25, 25, task.targetRoom));
                    else {
                        let targets = creep.room.find(FIND_STRUCTURES, {
                            filter: s => s.structureType == task.targetStructure
                        })
                        if (targets.length) {
                            if (task.operate == 'withdraw') {
                                let targetRes = task.targetRes || Object.keys(targets[0]['store'])[0];
                                if (targets[0]['store'][targetRes] == 0) {
                                    delete Memory.roomTask[roomFrom][creep.memory.taskId];
                                    global.cc[roomFrom].remoteTransfer = 0;
                                }
                                if (creep.store.getFreeCapacity() == 0) {
                                    App.fsm.changeState(creep, State.Back);
                                    return;
                                }
                                if (creep.withdraw(targets[0], targetRes as ResourceConstant) == ERR_NOT_IN_RANGE) {
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
            case Role.PB_Attacker: {
                let task = Memory.roomTask[roomFrom][creep.memory.taskId];
                if (!task) {
                    console.log(`攻击powerBank任务结束`);
                    global.cc[creep.memory.roomFrom].pb_attacker = 0;
                    global.cc[creep.memory.roomFrom].pb_healer = 0;
                    creep.memory.state = State.Back;
                    return;
                }
                // 先组队
                if (!creep.memory.healer) {
                    if (Game.time % 7 == 0) {
                        if (task.CreepBind[Role.PB_Healer].bind.length > 0) {
                            for (var c of task.CreepBind[Role.PB_Healer].bind) {
                                if (Game.creeps[c] && Game.creeps[c].pos.roomName == creep.room.name && !Game.creeps[c].memory.attacker) {
                                    var disCreep = Game.creeps[c];
                                    disCreep.memory.attacker = creep.name;
                                    creep.memory.healer = disCreep.name;
                                }
                            }
                        }
                    }
                    return;
                }
                let powerBankFlag = `PB_${creep.memory.roomFrom}_${task.targetRoom}`;
                // 移动到powerBank
                if (creep.room.name != task.targetRoom) {
                    creep.customMove(Game.flags[powerBankFlag].pos);
                    return;
                }
                // 附近没有治疗creep就等
                // if (Game.creeps[creep.memory.healer] && !creep.pos.isNearTo(Game.creeps[creep.memory.healer]) && (!isInArray([0, 49], creep.pos.x) && !isInArray([0, 49], creep.pos.y))) return;
                // 血量低于4000则等待治疗
                if (creep.hits < 3500) {
                    return;
                }
                // 攻击powerBank
                let powerBank = Game.getObjectById(task.targetStructureId);
                if (creep.attack(powerBank) == ERR_NOT_IN_RANGE) {
                    creep.customMove(powerBank.pos);
                }
                // TODO 攻击完成之后防御，发现没有power之后返回并unboost
            }
            case Role.PB_Healer: {
                let task = Memory.roomTask[roomFrom][creep.memory.taskId];
                if (!creep.memory.attacker && task) return;
                if (!Game.creeps[creep.memory.attacker] && !task) {
                    creep.memory.state = State.Unboost;
                    return;
                }
                if (Game.creeps[creep.memory.attacker]) {
                    if (creep.hits < creep.hitsMax) {
                        creep.heal(creep);
                    }
                    if (creep.pos.isNearTo(Game.creeps[creep.memory.attacker])) {
                        if (Game.creeps[creep.memory.attacker] && Game.creeps[creep.memory.attacker].hits < Game.creeps[creep.memory.attacker].hitsMax) {
                            creep.heal(Game.creeps[creep.memory.attacker]);
                            return;
                        }
                    } else {
                        if (creep.pos.inRangeTo(Game.creeps[creep.memory.attacker], 3)) {
                            creep.rangedHeal(Game.creeps[creep.memory.attacker])
                        }
                        creep.moveTo(Game.creeps[creep.memory.attacker].pos, { range: 1 })
                    }
                }
                
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
        }
    }

    public back(creep: Creep) {
        let roomFrom = creep.memory.roomFrom;
        switch (creep.memory.role) {
            case Role.PB_Carryer:
            case Role.RemoteTransfer: {
                if (creep.ticksToLive > 200 && creep.store.getUsedCapacity() == 0) {
                    App.fsm.changeState(creep, State.MoveTo);
                    return;
                }
                if (creep.room.name != roomFrom) {
                    creep.customMove(new RoomPosition(25, 25, roomFrom));
                } else if (creep.room.name == roomFrom) {
                    if (creep.store.getUsedCapacity() > 0 && creep.room.storage.store.getFreeCapacity() > 10000) {
                        App.common.transferToTargetStructure(creep, Game.rooms[roomFrom].storage);
                    } else if (creep.store.getUsedCapacity() > 0 && creep.room.terminal.store.getFreeCapacity() > 10000) {
                        App.common.transferToTargetStructure(creep, Game.rooms[roomFrom].terminal);
                    } else if (creep.ticksToLive < 200) {
                        creep.memory.state = State.Unboost;
                    }
                }
                break;
            }
            case Role.PB_Attacker:
            case Role.PB_Healer: {
                if (creep.room.name != roomFrom) {
                    creep.customMove(new RoomPosition(25, 25, roomFrom));
                } else if (creep.room.name == roomFrom) {
                    creep.memory.state = State.Unboost;
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

/*  判定是否在列表里 */
export function isInArray(arr: any[], value: any): boolean {
    for (var i = 0; i < arr.length; i++) {
      if (value === arr[i]) {
        return true
      }
    }
    return false
  }