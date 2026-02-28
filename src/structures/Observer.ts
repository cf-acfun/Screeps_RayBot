import App from "@/App";
import Singleton from "@/Singleton";
import { Role } from "@/common/Constant";
import { Operate } from "@/common/Constant"
import { GenNonDuplicateID } from "@/common/utils"
import { State } from "@/fsm/state";

export default class Observer extends Singleton {
    public run(roomName: string) {
        let room = Game.rooms[roomName];
        // if (Memory.username == 'Spon-Singer') return;
        if (room.controller.level < 8) return;

        // 检测测试旗子，用于测试防核功能
        if (Game.time % 10 === 0 || (room.memory.defenseRam && Object.keys(room.memory.defenseRam).length > 0)) {


            const nukes = room.find(FIND_NUKES) as Nuke[];
            const testFlag = Game.flags[`${roomName}_nukerTest`];
            if (testFlag && testFlag.pos.roomName === roomName) {
                // 虚拟一个 nuke 对象，将旗子位置作为核弹落点
                nukes.push({
                    pos: testFlag.pos,
                    id: 'test_nuke_' + 0,
                    timeToLand: 99
                } as Nuke);
            }

            const testFlag1 = Game.flags[`${roomName}_nukerTest1`];
            if (testFlag1 && testFlag1.pos.roomName === roomName) {
                // 虚拟一个 nuke 对象，将旗子位置作为核弹落点
                nukes.push({
                    pos: testFlag1.pos,
                    id: 'test_nuke_' + 1,
                    timeToLand: 990
                } as Nuke);
            }
            if (nukes.length > 0) {
                // 每1000tick执行一次防御建筑检查
                if (Game.time % 10 === 0) {
                    console.log(`[防核警告] 房间 ${roomName} 检测到 ${nukes.length} 枚核弹即将落地！`);
                    this.handleNukeDefense(room, roomName, nukes);
                }
            } else {
                // 没有核弹时，清理防核内存和疏散状态
                if (room.memory.defenseRam && Object.keys(room.memory.defenseRam).length > 0) {
                    console.log(`[防核] 房间 ${roomName} 核弹已消失，清理防核内存`);
                    room.memory.defenseRam = {};
                    // 重置 repairer，让 AutoPlanner 恢复正常逻辑
                    if (global.cc[roomName]) {
                        global.cc[roomName].repairer = 0;
                    }
                    // 清除所有creep的疏散状态
                    this._clearEvacuateStatus(roomName);
                }
            }
            if (room.memory.defenseRam && Object.keys(room.memory.defenseRam).length > 0) {
                // 每tick检查是否需要疏散creep（核弹快落地时）
                console.log(`每tick检查是否需要疏散creep（核弹快落地时）`);
                this._evacuateCreeps(room, roomName, nukes);
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
                        const testFlag = Game.flags[`${roomName}_nukerTest`];
                        const testFlag1 = Game.flags[`${roomName}_nukerTest1`];
                        let baseRequiredHits = 0;
                        if (testFlag || testFlag1) {
                            baseRequiredHits = (dx === 0 && dy === 0) ? 1000 : 500;
                        } else {
                            baseRequiredHits = (dx === 0 && dy === 0) ? 10200000 : 5200000;
                        }

                        const posKey = `${x}_${y}`;

                        // 检查该位置是否已有 rampart
                        const existingRampart = structures.find(s => s.structureType === STRUCTURE_RAMPART) as StructureRampart;
                        const hasRampart = !!existingRampart;

                        // 如果已有 rampart，取当前血量和所需血量的最大值，保持高血量不降低
                        const requiredHits = hasRampart ? Math.max(existingRampart.hits, baseRequiredHits) : baseRequiredHits;

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
                                if (testFlag || testFlag1) {
                                    global.cc[roomName].repairer = 1;
                                } else {
                                    global.cc[roomName].repairer = 3;
                                }
                            }
                        }
                    }
                }
            }
        }

    }

    /**
     * 疏散creep：当核弹即将落地时，将creep疏散到其他房间
     * 注意：核弹会摧毁范围内的一切（即使躲在rampart下），所以必须离开本房间
     * @param room 房间对象
     * @param roomName 房间名
     * @param nukes 核弹数组
     */
    private _evacuateCreeps(room: Room, roomName: string, nukes: Nuke[]) {
        const EVACUATION_THRESHOLD = 100; // 核弹100 tick内落地时开始疏散（需要足够时间离开房间）

        // 查找可用的避难房间
        const safeRoom = this._findSafeRoom(roomName);
        if (!safeRoom) {
            console.log(`[防核疏散] 警告：房间 ${roomName} 未找到可用的避难房间！`);
            return;
        }

        for (const nuke of nukes) {
            // 只处理即将落地的核弹
            if (nuke.timeToLand > EVACUATION_THRESHOLD) continue;

            // 获取房间内所有我的creep
            const myCreeps = room.find(FIND_MY_CREEPS);

            for (const creep of myCreeps) {
                // 标记疏散状态
                if (!creep.memory.evacuating) {
                    creep.memory.evacuating = true;
                    creep.memory.evacuateTarget = `${nuke.pos.x}_${nuke.pos.y}`;
                    creep.memory.evacuateSafeRoom = safeRoom; // 记录避难房间
                    console.log(`[防核疏散] Creep ${creep.name} 开始疏散到房间 ${safeRoom}`);
                }

                // 移动到避难房间
                if (creep.room.name !== safeRoom) {
                    // 还没到达避难房间，继续移动
                    // const exitDir = Game.map.findExit(creep.room.name, safeRoom);
                    // if (exitDir !== ERR_NO_PATH && exitDir !== ERR_INVALID_ARGS) {
                    //     const exit = creep.pos.findClosestByPath(exitDir as ExitConstant);
                    //     if (exit) {
                    //         creep.moveTo(exit, { visualizePathStyle: { stroke: '#ff0000' } });
                    //     }
                    // }
                    creep.moveTo(new RoomPosition(25, 25, creep.memory.evacuateSafeRoom), { visualizePathStyle: { stroke: '#ff0000' } });
                } else {
                    // 已经到达避难房间，在安全位置等待
                    // 远离出口，避免被核弹波及
                    
                    creep.moveTo(new RoomPosition(25, 25, creep.memory.evacuateSafeRoom), { visualizePathStyle: { stroke: '#00ff00' } });
                    
                }
            }
        }
    }

    /**
     * 寻找避难房间：优先选择相邻的我方房间，排除 ignoreRoom 中的房间
     */
    private _findSafeRoom(roomName: string): string | null {
        const room = Game.rooms[roomName];
        const ignoreRooms = room?.memory.ignoreRoom || [];
        const adjacentRooms = Game.map.describeExits(roomName);

        // 优先选择相邻的我方房间（排除 ignoreRoom）
        for (const dir in adjacentRooms) {
            const adjacentRoomName = adjacentRooms[dir as ExitKey];
        
            if (ignoreRooms.includes(adjacentRoomName)) continue;
            return adjacentRoomName;
        }

        // 如果没有相邻的我方房间，选择任意可见的相邻房间（排除 ignoreRoom）
        for (const dir in adjacentRooms) {
            const adjacentRoomName = adjacentRooms[dir as ExitKey];
            if (ignoreRooms.includes(adjacentRoomName)) continue;
            if (Game.rooms[adjacentRoomName]) {
                return adjacentRoomName;
            }
        }

        return null;
    }

    /**
     * 清除疏散状态：核弹消失后恢复creep正常状态，并让creep返回原房间
     */
    private _clearEvacuateStatus(roomName: string) {
        for (const creepName in Game.creeps) {
            const creep = Game.creeps[creepName];
            if (creep.memory.evacuating && creep.memory.evacuateSafeRoom) {
                // 检查creep是否是从该房间疏散的（通过避难房间判断）
                const safeRoom = creep.memory.evacuateSafeRoom;

                // 如果creep在避难房间，让它返回原房间
                if (creep.room.name === safeRoom) {
                    // 返回原房间
                    creep.memory.state = State.Back;
                    creep.memory.evacuating = false;
                    creep.memory.evacuateTarget = undefined;
                    creep.memory.evacuateSafeRoom = undefined;
                    console.log(`[防核] Creep ${creep.name} 开始返回房间 ${roomName}，恢复正常工作`);
                } else if (creep.room.name === roomName) {
                    // 已经返回原房间，清除疏散状态
                    creep.memory.evacuating = false;
                    creep.memory.evacuateTarget = undefined;
                    creep.memory.evacuateSafeRoom = undefined;
                    console.log(`[防核] Creep ${creep.name} 已返回房间 ${roomName}，恢复正常工作`);
                }
            }
        }
    }

}