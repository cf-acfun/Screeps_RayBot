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
        // 缓存 observer interval 计算，避免重复计算
        const observerInterval = room.memory.observer.interval || (room.memory.index + 1) * 10 + 1;
        // 检测测试旗子，用于测试防核功能
        if (Game.time % 1000 === (room.memory.index % 1000) || (room.memory.defenseRam && Object.keys(room.memory.defenseRam).length > 0)) {


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
                if (Game.time % 1000 === (room.memory.index % 1000)) {
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
                    // 重置 RoomControlData 刷新标记，准备下一次防核使用
                    room.memory.isNukerDefenseFlush = undefined;
                }
                // 检查并重建被核弹摧毁的建筑
                this._checkAndRebuildStructures(room, roomName);
            }
            if (room.memory.defenseRam && Object.keys(room.memory.defenseRam).length > 0) {
                // 每tick检查是否需要疏散creep（核弹快落地时）
                this._evacuateCreeps(room, roomName, nukes);
            }
        }
        // 检查是否需要设置 temporaryBuilder 数量
        if (Game.time % (1000 + observerInterval) === (room.memory.index % (1000 + observerInterval))) {
            this._updateBuilderCount(room, roomName);
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
        // 初始化 RoomControlData 刷新标记
        if (room.memory.isNukerDefenseFlush === undefined) {
            room.memory.isNukerDefenseFlush = false;
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

            // 检查是否需要刷新 RoomControlData（只刷新一次）
            if (!room.memory.isNukerDefenseFlush) {
                this._flushRoomControlData(room, roomName);
                room.memory.isNukerDefenseFlush = true;
            }

            // 处理 Creep 疏散
            this._evacuateUnits(Game.creeps, roomName, safeRoom, nuke, 'Creep');
            // 处理 PowerCreep 疏散
            this._evacuateUnits(Game.powerCreeps, roomName, safeRoom, nuke, 'PowerCreep');
        }
    }

    /**
     * 统一处理单位疏散（Creep 或 PowerCreep）
     * @param units 单位集合（Game.creeps 或 Game.powerCreeps）
     * @param roomName 原房间名
     * @param safeRoom 避难房间名
     * @param nuke 核弹对象
     * @param unitType 单位类型（用于日志）
     */
    private _evacuateUnits(
        units: { [name: string]: Creep | PowerCreep },
        roomName: string,
        safeRoom: string,
        nuke: Nuke,
        unitType: string
    ) {
        for (const name in units) {
            const unit = units[name];
            // 只处理属于当前房间的单位
            // 对于 Creep，使用 roomFrom 判断；对于 PowerCreep，如果没有 roomFrom，使用当前所在房间判断
            // 如果 PowerCreep 没有 roomFrom，设置为其当前房间
            if (unitType === 'PowerCreep' && !unit.memory.roomFrom) {
                unit.memory.roomFrom = roomName;
            }
            if (unit.memory.roomFrom !== roomName) continue;

            // 标记疏散状态
            if (unit.room.name == roomName && !unit.memory.evacuating) {
                unit.memory.evacuating = true;
                unit.memory.evacuateTarget = `${nuke.pos.x}_${nuke.pos.y}`;
                unit.memory.evacuateSafeRoom = safeRoom;
                console.log(`[防核疏散] ${unitType} ${unit.name} 开始疏散到房间 ${safeRoom}`);
            }

            // 执行移动
            if (unit.memory.evacuating && unit.memory.evacuateSafeRoom) {
                const targetSafeRoom = unit.memory.evacuateSafeRoom;

                if (unit.room.name !== targetSafeRoom) {
                    // 还没到达避难房间，继续移动（红色路径）
                    unit.moveTo(new RoomPosition(25, 25, targetSafeRoom), {
                        visualizePathStyle: { stroke: '#ff0000' }
                    });
                } else {
                    // 已经到达避难房间，检查是否太靠近边缘（距离边缘至少保持2格）
                    const isNearEdge = unit.pos.x < 2 || unit.pos.x > 47 || unit.pos.y < 2 || unit.pos.y > 47;
                    if (isNearEdge) {
                        // 太靠近边缘，往中心方向移动一点（绿色路径）
                        unit.moveTo(new RoomPosition(25, 25, targetSafeRoom), {
                            visualizePathStyle: { stroke: '#00ff00' },
                            range: 10  // 不需要到正中心，靠近中心即可
                        });
                    }
                    // 距离边缘至少2格，安全位置，停止移动等待核弹落地
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
     * 刷新 RoomControlData：在核弹疏散前保存当前房间的建筑信息
     * 排除 defenseRam 中已有的 rampart（这些是核弹防御临时建的）
     */
    private _flushRoomControlData(room: Room, roomName: string) {
        if (!Memory.RoomControlData) Memory.RoomControlData = {};
        if (!Memory.RoomControlData[roomName]) Memory.RoomControlData[roomName] = {};
        if (Memory.RoomControlData[roomName].nukerDefenseRam) Memory.RoomControlData[roomName].nukerDefenseRam = [];
        if (Memory.RoomControlData[roomName].nukerDefenseStructMap) Memory.RoomControlData[roomName].nukerDefenseStructMap = [];
        // 收集 defenseRam 中已有的位置，用于排除 rampart
        const defenseRamPositions = new Set<string>();
        const defenseRam = room.memory.defenseRam;
        if (defenseRam) {
            for (const nukeId in defenseRam) {
                // 跳过非核弹ID的字段
                const nukeDefense = defenseRam[nukeId];
                if (typeof nukeDefense === 'object') {
                    for (const posKey in nukeDefense) {
                        const pos = nukeDefense[posKey];
                        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
                            defenseRamPositions.add(`${pos.x}_${pos.y}`);
                        }
                    }
                }
            }
        }

        // 收集所有 rampart 位置（排除防核 rampart）
        const ramparts: number[][] = [];
        const rampartStructures = room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_RAMPART
        }) as StructureRampart[];
        for (const rampart of rampartStructures) {
            const posKey = `${rampart.pos.x}_${rampart.pos.y}`;
            if (!defenseRamPositions.has(posKey)) {
                ramparts.push([rampart.pos.x, rampart.pos.y]);
            }
        }

        // 收集所有重要建筑到 structMap
        // 格式: "x/y/structureType/level"
        const structMap: string[] = [];
        const allStructures = room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL // 排除 rampart 和 wall
        }) as Structure[];

        for (const struct of allStructures) {
            const structType = struct.structureType;
            // 再次确认排除 wall（双重保险）
            if (structType === STRUCTURE_WALL) continue;
            // 获取建筑等级（如果有）
            let level = 1;
            structMap.push(`${struct.pos.x}/${struct.pos.y}/${structType}/${level}`);
        }

        // 更新 RoomControlData（使用独立的 nukerDefense 字段，避免覆盖原有数据）
        Memory.RoomControlData[roomName].nukerDefenseRam = ramparts;
        Memory.RoomControlData[roomName].nukerDefenseStructMap = structMap;
        console.log(`[防核] 房间 ${roomName} RoomControlData 已刷新，保存了 ${ramparts.length} 个 rampart、${structMap.length} 个建筑（排除了 ${defenseRamPositions.size} 个防核 rampart）`);
    }

    /**
     * 清除疏散状态：核弹消失后恢复单位正常状态，并让单位返回原房间
     */
    private _clearEvacuateStatus(roomName: string) {
        // 处理 Creep
        this._clearUnitsEvacuateStatus(Game.creeps, roomName, 'Creep');
        // 处理 PowerCreep
        this._clearUnitsEvacuateStatus(Game.powerCreeps, roomName, 'PowerCreep');
    }

    /**
     * 清除单位的疏散状态
     */
    private _clearUnitsEvacuateStatus(
        units: { [name: string]: Creep | PowerCreep },
        roomName: string,
        unitType: string
    ) {
        for (const name in units) {
            const unit = units[name];
            // 只处理属于当前房间且正在疏散的单位
            // 对于 Creep，使用 roomFrom 判断；对于 PowerCreep，如果没有 roomFrom，使用当前所在房间判断
            const unitRoomFrom = unit.memory.roomFrom || (unitType === 'PowerCreep' ? unit.room?.name : undefined);
            if (unitRoomFrom !== roomName) continue;
            if (!unit.memory.evacuating || !unit.memory.evacuateSafeRoom) continue;

            const safeRoom = unit.memory.evacuateSafeRoom;

            // 如果单位在避难房间，让它返回原房间
            if (unit.room.name === safeRoom) {
                // 返回原房间
                unit.memory.state = State.Back;
                if (unitType === 'Creep') {
                    unit.memory.evacuating = false;
                    unit.memory.evacuateTarget = undefined;
                    unit.memory.evacuateSafeRoom = undefined;
                }
                console.log(`[防核] ${unitType} ${unit.name} 开始返回房间 ${roomName}，恢复正常工作`);
            } else if (unit.room.name === roomName) {
                // 已经返回原房间，清除疏散状态
                unit.memory.evacuating = false;
                unit.memory.evacuateTarget = undefined;
                unit.memory.evacuateSafeRoom = undefined;
                if (unitType === 'Creep') {
                    (unit as Creep).memory.state = undefined;
                }
                console.log(`[防核] ${unitType} ${unit.name} 已返回房间 ${roomName}，恢复正常工作`);
            }
        }
    }

    /**
     * 更新 TemporaryBuilder 数量：检查房间是否有建筑工地，设置 temporaryBuilder 数量
     * 使用独立的 temporaryBuilder role，不影响普通 builder
     * 有建筑工地时设为 1，没有时设为 0
     */
    private _updateBuilderCount(room: Room, roomName: string) {
        // 检查房间中是否有建筑工地
        const constructionSites = room.find(FIND_CONSTRUCTION_SITES);

        if (!global.cc[roomName]) global.cc[roomName] = {};

        if (constructionSites.length > 0) {
            // 有建筑工地，设置 temporaryBuilder = 1（独立于普通 builder）
            if (global.cc[roomName].temporaryBuilder !== 1) {
                global.cc[roomName].temporaryBuilder = 1;
                console.log(`房间 ${roomName} 存在 ${constructionSites.length} 个建筑工地，设置 temporaryBuilder = 1`);
            }
        } else {
            // 没有建筑工地，重置 temporaryBuilder = 0
            if (global.cc[roomName].temporaryBuilder !== 0) {
                global.cc[roomName].temporaryBuilder = 0;
                console.log(`房间 ${roomName} 没有建筑工地，设置 temporaryBuilder = 0`);
            }
        }
    }

    /**
     * 检查并重建被核弹摧毁的建筑
     * 对比 nukerDefenseStructMap 和当前建筑，缺失的创建 construction site
     */
    private _checkAndRebuildStructures(room: Room, roomName: string) {
        const roomControlData = Memory.RoomControlData?.[roomName];
        if (!roomControlData?.nukerDefenseStructMap) return;

        const structMap = roomControlData.nukerDefenseStructMap;
        let rebuildCount = 0;

        for (const structInfo of structMap) {
            // 格式: "x/y/structureType/level"
            const [xStr, yStr, structType, levelStr] = structInfo.split('/');
            const x = parseInt(xStr);
            const y = parseInt(yStr);
            const level = parseInt(levelStr);

            if (isNaN(x) || isNaN(y) || !structType) continue;

            // 检查该位置是否已有相同类型的建筑或建筑工地
            const pos = new RoomPosition(x, y, roomName);
            const existingStructures = pos.lookFor(LOOK_STRUCTURES) as Structure[];
            const existingSites = pos.lookFor(LOOK_CONSTRUCTION_SITES) as ConstructionSite[];

            // 如果已有该类型的建筑或建筑工地，跳过
            const hasStructure = existingStructures.some(s => s.structureType === structType);
            const hasSite = existingSites.some(s => s.structureType === structType);

            if (hasStructure || hasSite) continue;

            // 检查控制器等级是否足够
            if (room.controller && room.controller.level < level) continue;

            // 创建建筑工地
            const result = room.createConstructionSite(x, y, structType as BuildableStructureConstant);
            if (result === OK) {
                rebuildCount++;
                console.log(`[防核重建] 在 (${x}, ${y}) 创建 ${structType} 建筑工地`);
            } else if (result === ERR_RCL_NOT_ENOUGH) {
                // 控制器等级不足，跳过
                continue;
            } else if (result === ERR_INVALID_TARGET) {
                // 无效目标，可能是该位置不能建造此建筑
                console.log(`[防核重建] 无法创建 ${structType} 在 (${x}, ${y})，位置无效`);
            }
        }

        if (rebuildCount > 0) {
            console.log(`[防核重建] 房间 ${roomName} 重建了 ${rebuildCount} 个建筑`);
            // 重建完成后，可以清理备份数据（可选）
            // roomControlData.nukerDefenseStructMap = undefined;
            // roomControlData.nukerDefenseRam = undefined;
        }
    }

}