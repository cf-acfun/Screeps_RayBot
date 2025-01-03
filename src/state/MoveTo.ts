import App from "@/App";
import { Role } from "@/common/Constant";
import { State } from "@/fsm/state";
import Singleton from "@/Singleton";
import { Operate } from "@/common/Constant"
import { GenNonDuplicateID } from "@/common/utils"


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
                        creep.customMove(transfer.pos);
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
                if (creep.store.getUsedCapacity() > 0) {
                    creep.memory.state = State.Back;
                }
                let task = Memory.roomTask[roomFrom][creep.memory.taskId];
                // console.log(`当前task[${creep.memory.taskId}], 需要孵化[${global.cc[creep.memory.roomFrom].pb_carryer}]个爬`);
                if (!task) {
                    global.cc[creep.memory.roomFrom].pb_carryer = 0;
                    creep.memory.state = State.Back;
                    return;
                }
                let powerBankFlag = `PB_${creep.memory.roomFrom}_${task.targetRoom}`;
                if (creep.room.name != task.targetRoom) {
                    creep.customMove(new RoomPosition(25, 25, task.targetRoom));
                } else {
                    if (Game.flags[powerBankFlag] && !creep.pos.inRangeTo(Game.flags[powerBankFlag].pos, 3)) {
                        creep.customMove(Game.flags[powerBankFlag].pos);
                        return;
                    }
                    let power = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                        filter: (d) => d.amount >= 10 && d.resourceType == "power"
                    });
                    let pbRuin = creep.pos.findClosestByRange(FIND_RUINS);
                    if (power) {
                        if (creep.pickup(power) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(power.pos);
                            return;
                        }
                    } else if (!Game.flags[powerBankFlag] && !pbRuin) {
                        // console.log(`目标房间[${creep.room.name}],power搬运任务完成,删除任务`);
                        if (Memory.roomTask[creep.memory.roomFrom][creep.memory.taskId]) {
                            delete Memory.roomTask[creep.memory.roomFrom][creep.memory.taskId];
                        }
                    } else {
                        if (Game.flags[powerBankFlag]) {
                            // 如果存在旗子检查是否有powerBank或者ruin或者power，都没有就删除任务
                            let powerBank = Game.getObjectById(task.targetStructureId) as StructurePowerBank;
                            // console.log(`当前room[${creep.room.name}]当前powerBank=[${powerBank}], power=[${power}],pbRuin=[${pbRuin}]`);
                            if (!powerBank && !power && !pbRuin) {
                                // console.log(`采集power任务取消,删除所有相关任务`);
                                // 删除所有任务
                                global.cc[creep.memory.roomFrom].pb_attacker = 0;
                                global.cc[creep.memory.roomFrom].pb_healer = 0;
                                creep.memory.state = State.Back;
                                Game.flags[powerBankFlag].remove();
                                let roomName = creep.memory.roomFrom;
                                let task = Memory.roomTask[roomName];
                                let targetRoom = creep.room.name;
                                let attackTask = null;
                                for (let t in task) {
                                    // console.log(`当前t为[${t}]`);
                                    let taskM = Memory.roomTask[roomName][t];
                                    if (taskM.targetRoom == targetRoom && taskM.role != Role.PB_Attacker) {
                                        continue;
                                    }
                                    if (taskM.role == Role.PB_Attacker) {
                                        attackTask = t;
                                        break;
                                    }
                                }
                                if (Memory.roomTask[creep.memory.roomFrom][attackTask]) {
                                    delete Memory.roomTask[creep.memory.roomFrom][attackTask];
                                }
                            }
                        }
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
                    // console.log(`攻击powerBank任务结束`);
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
                // 血量低于4000则等待治疗
                if (creep.hits < 3000) {
                    return;
                }
                // let hostileCreeps: Creep[] = Game.rooms[creep.room.name].find(FIND_HOSTILE_CREEPS) as Creep[];
                // if (hostileCreeps.length > 0) {
                //     if (creep.attack(hostileCreeps[0]) == ERR_NOT_IN_RANGE) {
                //         creep.customMove(hostileCreeps[0].pos);
                //     }
                // }
                // 攻击powerBank
                let powerBank = Game.getObjectById(task.targetStructureId) as StructurePowerBank;
                if (creep.attack(powerBank) == ERR_NOT_IN_RANGE) {
                    creep.customMove(powerBank.pos);
                }
                if (powerBank) {
                    // console.log(`当前creep[${creep.name}]`);
                    let roomName = creep.memory.roomFrom;
                    // 检测powerBank的血量并发布Carry任务
                    if (powerBank.hits < 1500000) {
                        // 是否已经发布了任务
                        let task = Memory.roomTask[roomName];
                        let targetRoom = creep.room.name;
                        let carryTask = null;
                        for (let t in task) {
                            // console.log(`当前t为[${t}]`);
                            let taskM = Memory.roomTask[roomName][t];
                            if (taskM.targetRoom == targetRoom && taskM.role != Role.PB_Carryer) {
                                continue;
                            }
                            if (taskM.role == Role.PB_Carryer) {
                                carryTask = t;
                                break;
                            }
                        }
                        // console.log(`当前搬运task为[${carryTask}]`);
                        if (!carryTask) {
                            let carrierNum = Math.ceil(powerBank.power / 1250);
                            console.log(`当前房间[${creep.room.name}]需要孵化[${carrierNum}]个搬运工`);
                            let CreepBind = { 'pb_carryer': { num: carrierNum, bind: [] } };
                            global.createRoomTask(`${Role.PB_Carryer}_${GenNonDuplicateID()}`, roomName, targetRoom, Role.PB_Carryer as Role, Operate.Harveste_power, STRUCTURE_POWER_BANK, powerBank.id, carrierNum, CreepBind);
                        }
                    }
                }
                if (!powerBank) {
                    // console.log(`房间[${creep.room.name}],powerBank已被摧毁,返回`);
                    global.cc[creep.memory.roomFrom].pb_attacker = 0;
                    global.cc[creep.memory.roomFrom].pb_healer = 0;
                    if (Game.flags[powerBankFlag]) {
                        Game.flags[powerBankFlag].remove();
                    }
                    if (Memory.roomTask[creep.memory.roomFrom][creep.memory.taskId]) {
                        delete Memory.roomTask[creep.memory.roomFrom][creep.memory.taskId];
                    }
                    creep.memory.state = State.Back;
                    return;
                }
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
            case Role.PB_Carryer: {
                if (creep.room.name != roomFrom) {
                    creep.customMove(new RoomPosition(25, 25, roomFrom));
                } else if (creep.room.name == roomFrom) {
                    if (creep.store.getUsedCapacity() > 0 && creep.room.storage.store.getFreeCapacity() > 10000) {
                        App.common.transferToTargetStructure(creep, Game.rooms[roomFrom].storage);
                        return;
                    }
                    if (creep.store.getUsedCapacity() > 0 && creep.room.terminal.store.getFreeCapacity() > 10000) {
                        App.common.transferToTargetStructure(creep, Game.rooms[roomFrom].terminal);
                        return;
                    }
                    let task = Memory.roomTask[roomFrom][creep.memory.taskId];
                    if (!task) {
                        global.cc[creep.memory.roomFrom].pb_carryer = 0;
                        if (creep.store.getUsedCapacity() == 0) {
                            // 移动到unboost点然后suicide
                            let { x, y, roomName } = creep.room.memory.unboostContainerPos;
                            if (!Game.getObjectById(creep.room.memory.unboostContainer)) {
                                let construcure = creep.room.lookForAt(LOOK_STRUCTURES, new RoomPosition(x, y, roomName)).filter(e => e.structureType == STRUCTURE_CONTAINER)
                                if (construcure.length) creep.room.memory.unboostContainer = construcure[0].id as Id<StructureContainer>;
                                else creep.suicide();
                            } else {
                                creep.customMove(new RoomPosition(x, y, roomName), 0);
                                if (App.common.getDis(creep.pos, new RoomPosition(x, y, roomName)) == 0) {
                                    creep.suicide();
                                }
                            }
                            return;
                        }
                    } else {
                        // task存在就继续回去搬
                        if (creep.ticksToLive > 200 && creep.store.getUsedCapacity() == 0) {
                            App.fsm.changeState(creep, State.MoveTo);
                            return;
                        }
                    }
                }
                break;
            }
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