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
                }

                if (room.memory.observer.index == num - 1) room.memory.observer.index = 0;
                else room.memory.observer.index++;
            }
        }
    }
}