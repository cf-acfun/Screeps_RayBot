import App from "@/App";
import Singleton from "@/Singleton";
import { Role } from "@/common/Constant";
import { Operate } from "@/common/Constant"
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
                        var pb = Game.rooms[targetRoom].find(FIND_STRUCTURES, {
                            filter: (stru) => {
                                return stru.structureType == 'powerBank' && stru.ticksToDecay >= 3000 && stru.power > 2000
                            }
                        }) as StructurePowerBank[];

                        let hasHarvestTask = false;
                        // 每个房间只允许同时存在一个采集power任务
                        if (!Memory.roomTask) Memory.roomTask = {};
                        if (!Memory.roomTask[roomName]) Memory.roomTask[roomName] = {};
                        if (Memory.roomTask[roomName]) {
                            for (let i in Memory.roomTask[roomName]) {
                                if (i.includes(Role.PB_Attacker)) {
                                    // console.log(`目标房间[${targetRoom}]当前房间[${roomName}]已经存在采集power任务[${i}]`);
                                    hasHarvestTask = true;
                                    break;
                                }
                            }
                        }
                        if (pb.length > 0 && !hasHarvestTask) {
                            Game.rooms[targetRoom].createFlag(pb[0].pos, PowerBank);
                            // 创建roomTask
                            let CreepBind = { 'pb_healer': { num: 1, bind: [] } };
                            global.createRoomTask(`${Role.PB_Attacker}_${GenNonDuplicateID()}`, roomName, targetRoom, Role.PB_Attacker as Role, Operate.Harveste_power, STRUCTURE_POWER_BANK, pb[0].id, 1, CreepBind);
                        }

                    }
                    if (Game.flags[PowerBank]) {
                        // 已经发现powerBank 进行powerBank状态检查
                        var pb = Game.rooms[targetRoom].find(FIND_STRUCTURES, {
                            filter: (stru) => {
                                return stru.structureType == 'powerBank'
                            }
                        }) as StructurePowerBank[];
                        if (pb.length > 0) {
                            console.log(`当前房间[${targetRoom}]pb剩余hits为[${pb[0].hits}]`);
                            // 2M = 2000000
                            if (pb[0].hits < 1500000) {
                                // 是否已经发布了任务
                                let task = Memory.roomTask[roomName];
                                let carryTask = null;
                                for (let t in task) {
                                    // console.log(`当前t为[${t}]`);
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
                                    let carrierNum = Math.ceil(pb[0].power / 1250);
                                    // console.log(`需要孵化[${carrierNum}]个搬运工`);
                                    let CreepBind = { 'pb_carryer': { num: carrierNum, bind: [] } };
                                    global.createRoomTask(`${Role.PB_Carryer}_${GenNonDuplicateID()}`, roomName, targetRoom, Role.PB_Carryer as Role, Operate.Harveste_power, STRUCTURE_POWER_BANK, pb[0].id, carrierNum, CreepBind);
                                }
                            }
                        }
                        // else {
                        //     // 查询是否剩余power
                        //     let power = Game.rooms[roomName].find(FIND_DROPPED_RESOURCES, {
                        //         filter: (d) => d.amount >= 10 && d.resourceType == "power"
                        //     });
                        //     if (power.length == 0) {
                        //         console.log(`当前房间[${targetRoom}]任务结束,删除任务`);
                        //         let task = Memory.roomTask[roomName];
                        //         let carryTaskId = null;
                        //         let attackTaskId = null;
                        //         for (let t in task) {
                        //             let taskM = Memory.roomTask[roomName][t];
                        //             if (taskM.role == Role.PB_Carryer) {
                        //                 carryTaskId = t;
                        //             }
                        //             if (taskM.role == Role.PB_Attacker) {
                        //                 attackTaskId = t;
                        //             }
                        //         }
                        //         Game.flags[PowerBank].remove();
                        //         delete Memory.roomTask[roomName][attackTaskId];
                        //     }
                        // }
                    }
                }

                if (room.memory.observer.index == num - 1) room.memory.observer.index = 0;
                else room.memory.observer.index++;
            }
        }
    }
}