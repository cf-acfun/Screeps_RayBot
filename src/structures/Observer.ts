import App from "@/App";
import Singleton from "@/Singleton";
import { Role } from "@/common/Constant";
import { Operate } from "@/common/Constant"
import { State } from "@/fsm/state";
import { GenNonDuplicateID } from "@/common/utils"

export default class Observer extends Singleton {
    public run(roomName: string) {
        let room = Game.rooms[roomName];
        if (room.controller.level < 8) return;
        let observer: StructureObserver = Game.getObjectById(room.memory.observer.id);
        if (!observer) return;
        let targets = room.memory.observer.targets;
        if (!targets.length) return;
        for (let i = 0; i < targets.length; i++) {
            let target = targets[i]
            let name = `Depo_${roomName}_${target}`;
            if (Game.flags[name]) {
                if (!Game.creeps[name]) {
                    App.spawn.run(roomName, Role.DepositHarvester, name)
                }
            }
        }

        let index = room.memory.observer.index;
        let targetRoom = targets[index];
        let num = targets.length;
        if (Game.time % (room.memory.observer.interval || (room.memory.index + 1) * 10 + 1) == 0) {
            observer.observeRoom(targetRoom);
        }

        if (Game.time % (room.memory.observer.interval || (room.memory.index + 1) * 10 + 1) == 1) {
            if (Game.rooms[targetRoom]) {
                // 判断新手墙
                let wall = Game.rooms[targetRoom].find(FIND_STRUCTURES, {
                    filter: (structure) => structure.structureType == STRUCTURE_WALL
                });
                if (!wall.length) {
                    let DN = `Depo_${roomName}_${targetRoom}`;
                    let PowerBank = `PB_${roomName}_${targetRoom}`;
                    if (!Game.flags[DN]) {
                        if (!Game.creeps[DN]) {
                            let deposits = Game.rooms[targetRoom].find(FIND_DEPOSITS, {
                                filter: (deposit) => deposit.lastCooldown <= 60
                            })
                            if (deposits.length > 0) {
                                Game.rooms[targetRoom].createFlag(deposits[0].pos, DN);
                                App.spawn.run(roomName, Role.DepositHarvester, DN);
                            }
                        }
                    }
                    if (!Game.flags[PowerBank]) {
                        // TODO 发布房间任务 房间任务框架roomTask
                        // let pb = Game.rooms[targetRoom].find(FIND_STRUCTURES, {
                        //     filter: { structureType: STRUCTURE_POWER_BANK }
                        // });
                        var pb = Game.rooms[targetRoom].find(FIND_STRUCTURES, {
                            filter: (stru) => {
                                return stru.structureType == 'powerBank' && stru.ticksToDecay >= 3600 && stru.power > 3000
                                // return stru.structureType == 'powerBank' && stru.power > 1000
                            }
                        }) as StructurePowerBank[];
                        // 是否有他人creep
                        let hostileCreeps = Game.rooms[targetRoom].find(FIND_HOSTILE_CREEPS);
                        if (hostileCreeps.length > 0) {
                            console.log(`当前房间存在他人creep[${hostileCreeps}]`);
                        } else {
                            // let power = Game.rooms[targetRoom].find(FIND_DROPPED_RESOURCES, {
                            //     filter: (d) => d.amount >= 100 && d.resourceType == "power"
                            // });
                            // 插旗
                            if (pb.length > 0) {
                                Game.rooms[targetRoom].createFlag(pb[0].pos, PowerBank);
                                // 创建roomTask
                                let CreepBind = { 'pb_healer': {num: 1, bind: []}};
                                global.createRoomTask(`${Role.PB_Attacker}_${GenNonDuplicateID()}`, roomName, targetRoom, Role.PB_Attacker as Role, Operate.Harveste_power, STRUCTURE_POWER_BANK, pb[0].id, 1, CreepBind);
                                // global.createRoomTask(`${Role.PB_Healer}_${GenNonDuplicateID()}`, roomName, targetRoom, Role.PB_Healer as Role, Operate.Harveste_power, STRUCTURE_POWER_BANK, pb[0].id, 2);
                            }
                        }
                    }
                    if (Game.flags[PowerBank]) {
                        // 已经发现powerBank 进行powerBank状态检查
                        // if (Game.time % 20 == 0) {
                            var pb = Game.rooms[targetRoom].find(FIND_STRUCTURES, {
                                filter: (stru) => {
                                    return stru.structureType == 'powerBank'
                                }
                            }) as StructurePowerBank[];
                            if (pb.length > 0) {
                                console.log(`当前pb剩余hits为[${pb[0].hits}]`);
                                // 2M = 2000000
                                if (pb[0].hits < 1000000) {
                                    // TODO 计算什么时候发布任务
                                    // 是否已经发布了任务
                                    let task = Memory.roomTask[roomName];
                                    let carryTask = null;
                                    let carrierNum = 2;
                                    for (let t in task) {
                                        console.log(`当前t为[${t}]`);
                                        let taskM = Memory.roomTask[roomName][t];
                                        if (taskM.targetRoom == targetRoom && taskM.role != Role.PB_Carryer) {
                                            continue;
                                        }
                                        if (taskM.role == Role.PB_Carryer) {
                                            carryTask = taskM.role;
                                            break;
                                        }
                                    }
                                    if (!carryTask) {
                                        // TODO 计算出几个carrier
                                        let CreepBind = { 'pb_carryer': {num: 5, bind: []}};
                                        global.createRoomTask(`${Role.PB_Carryer}_${GenNonDuplicateID()}`, roomName, targetRoom, Role.PB_Carryer as Role, Operate.Harveste_power, STRUCTURE_POWER_BANK, pb[0].id, 5, CreepBind);
                                    }
                                    
                                }
                            }

                        // }
                        
                        // 剩余多少hits
                        //    TODO 增加删除roomTask功能
                        // 一共多少power，计算需要出多少carrier
                    }
                }

                if (room.memory.observer.index == num - 1) room.memory.observer.index = 0;
                else room.memory.observer.index++;
            }
        }
    }
}