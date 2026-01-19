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
        // 缓存 observer interval 计算，避免重复计算
        const observerInterval = room.memory.observer.interval || (room.memory.index + 1) * 10 + 1;
        if (Game.time % observerInterval == 0) {
            observer.observeRoom(targetRoom);
        }

        if (Game.time % observerInterval == 1) {
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
                                let deposit = deposits[0];
                                // 只有在存在可采集点位时才创建任务，避免被敌方完全占满时反复创建任务
                                if (this.hasAvailableDepositPos(deposit.pos)) {
                                    Game.rooms[targetRoom].createFlag(deposit.pos, DN);
                                    App.spawn.run(roomName, Role.DepositHarvester, DN);
                                }
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

    // 检测 deposit 周围是否存在可供我方采集的空位（没有墙且没有敌方 creep 占据）
    private hasAvailableDepositPos(pos: RoomPosition): boolean {
        let room = Game.rooms[pos.roomName];
        if (!room) return true; // 房间不可见时不做取消处理，保守返回 true
        let terrain = Game.map.getRoomTerrain(pos.roomName);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx == 0 && dy == 0) continue;
                let x = pos.x + dx;
                let y = pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) == TERRAIN_MASK_WALL) continue;
                let creepsHere = room.lookForAt(LOOK_CREEPS, x, y) as Creep[];
                let hostile = creepsHere.find(c => !c.my);
                // 只要存在一个不是被敌方占据的可走位置，就认为可以采集
                if (!hostile) return true;
            }
        }
        return false;
    }
}