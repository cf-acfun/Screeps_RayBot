import App from "@/App";
import Singleton from "@/Singleton";
import { Role } from "@/common/Constant";
import { Operate } from "@/common/Constant"
import { GenNonDuplicateID } from "@/common/utils"

export default class Observer extends Singleton {
    public run(roomName: string) {
        let room = Game.rooms[roomName];
        // if (Memory.username == 'Spon-Singer') return;
        if (room.controller.level < 8) return;

        // 防核功能：每1000tick检查一次是否有即将落地的核弹
        if (Game.time % 10 === 0) {
            const nukes = room.find(FIND_NUKES);

            // 检测测试旗子，用于测试防核功能
            const testFlag = Game.flags[`${roomName}_nukerTest`];
            if (testFlag && testFlag.pos.roomName === roomName) {
                console.log(`当前房间${roomName}存在testFlag`);
                // 虚拟一个 nuke 对象，将旗子位置作为核弹落点
                nukes.push({
                    pos: testFlag.pos,
                    id: 'test_nuke_' + 0,
                    timeToLand: 100
                } as Nuke);
            }

            const testFlag1 = Game.flags[`${roomName}_nukerTest1`];
            if (testFlag1 && testFlag1.pos.roomName === roomName) {
                console.log(`当前房间${roomName}存在testFlag`);
                // 虚拟一个 nuke 对象，将旗子位置作为核弹落点
                nukes.push({
                    pos: testFlag1.pos,
                    id: 'test_nuke_' + 1,
                    timeToLand: 100
                } as Nuke);
            }

            if (nukes.length > 0) {
                console.log(`[防核警告] 房间 ${roomName} 检测到 ${nukes.length} 枚核弹即将落地！`);
                this.handleNukeDefense(room, roomName, nukes);
            }
        }
        if (Memory.username == 'Spon-Singer') {
            return;
        }
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

    // TODO 待验证
    /**
     * 处理核弹防御
     * 对着落位置造成 10,000,000 hits 伤害
     * 对周围 5x5 区域中的建筑造成 5,000,000 hits 伤害
     */
    private handleNukeDefense(room: Room, roomName: string, nukes: Nuke[]) {
        // 初始化 defenseRam 内存
        if (!room.memory.defenseRam) {
            room.memory.defenseRam = {};
        }

        for (const nuke of nukes) {
            const nukeId = nuke.id;
            
            // 为每个核弹初始化独立的防御记录
            if (!room.memory.defenseRam[nukeId]) {
                room.memory.defenseRam[nukeId] = {};
                console.log(`[防核] 开始为核弹 ${nukeId} 在 (${nuke.pos.x}, ${nuke.pos.y}) 创建防御记录`);
            }

            const centerX = nuke.pos.x;
            const centerY = nuke.pos.y;

            // 检查 5x5 区域内的所有建筑
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    const x = centerX + dx;
                    const y = centerY + dy;

                    // 边界检查
                    if (x < 0 || x > 49 || y < 0 || y > 49) continue;

                    const pos = new RoomPosition(x, y, roomName);
                    
                    // 查找该位置上的所有建筑（不包括墙和路以及extension和tower）
                    const structures = pos.lookFor(LOOK_STRUCTURES) as Structure[];
                    const hasImportantStructure = structures.some(s => 
                        s.structureType !== STRUCTURE_ROAD && 
                        s.structureType !== STRUCTURE_WALL &&
                        s.structureType !== STRUCTURE_RAMPART &&
                        s.structureType !== STRUCTURE_EXTENSION &&
                        s.structureType !== STRUCTURE_TOWER &&
                        s.structureType !== STRUCTURE_LINK
                    );

                    if (hasImportantStructure) {
                        // 计算所需血量：中心位置1001万，周围501万
                        // const requiredHits = (dx === 0 && dy === 0) ? 10010000 : 5010000;
                        const requiredHits = (dx === 0 && dy === 0) ? 1000 : 500;
                        const posKey = `${x}_${y}`;

                        // 检查该位置是否已有 rampart
                        const existingRampart = structures.find(s => s.structureType === STRUCTURE_RAMPART) as StructureRampart;
                        const hasRampart = !!existingRampart;

                        // 更新内存 - 以核弹ID为第一层键
                        room.memory.defenseRam[nukeId][posKey] = {
                            x: x,
                            y: y,
                            requiredHits: requiredHits,
                            hasRampart: hasRampart
                        };

                        // 如果没有 rampart，创建 construction site
                        if (!hasRampart) {
                            const result = room.createConstructionSite(x, y, STRUCTURE_RAMPART);
                            if (result === OK) {
                                if (!global.cc[roomName]) global.cc[roomName] = {};
                                global.cc[roomName].repairer = 1;
                                console.log(`[防核] 核弹 ${nukeId}：在 (${x}, ${y}) 创建 rampart 建筑工地`);
                            }
                        } else {
                            // 已有 rampart，检查血量是否足够
                            if (existingRampart.hits < requiredHits) {
                                console.log(`[防核] 核弹 ${nukeId}：位置 (${x}, ${y}) 的 rampart 需要修复至 ${requiredHits}，当前 ${existingRampart.hits}`);
                                // 设置修复工数量以确保防御
                                if (!global.cc[roomName]) global.cc[roomName] = {};
                                global.cc[roomName].repairer = 1;
                            }
                        }
                    }
                }
            }
        }

        // 检查所有防核 rampart 是否都已满足血量要求
        this._checkDefenseRamComplete(room, roomName);
    }

    /**
     * 检查所有防核 rampart 是否都已满足血量要求
     * 如果全部满足，则将 repairer 设为 0
     */
    private _checkDefenseRamComplete(room: Room, roomName: string) {
        const defenseRam = room.memory.defenseRam;
        if (!defenseRam) return;

        let allDefensesComplete = true;

        for (const nukeId in defenseRam) {
            const nukeDefense = defenseRam[nukeId];
            for (const posKey in nukeDefense) {
                const { x, y, requiredHits } = nukeDefense[posKey];
                const pos = new RoomPosition(x, y, roomName);
                const ramparts = pos.lookFor(LOOK_STRUCTURES).filter(s => s.structureType === STRUCTURE_RAMPART) as StructureRampart[];
                
                if (ramparts.length === 0 || ramparts[0].hits < requiredHits) {
                    allDefensesComplete = false;
                    break;
                }
            }
            if (!allDefensesComplete) break;
        }

        if (allDefensesComplete) {
            if (!global.cc[roomName]) global.cc[roomName] = {};
            global.cc[roomName].repairer = 0;
            console.log(`[防核] 房间 ${roomName} 所有防核 rampart 已满足血量要求，重置 repairer 为 0`);
        }
    }
}