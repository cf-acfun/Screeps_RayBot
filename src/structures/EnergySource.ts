import App from "@/App";
import { Role } from "@/common/Constant";
import { GenNonDuplicateID } from "@/common/utils";
import PC from "@/PC/PC";
import Singleton from "@/Singleton";

export default class EnergySource extends Singleton {
    public run(roomName: string) {
        let room = Game.rooms[roomName];
        if (room.memory.sources) {
            for (let i = 0; i < Object.keys(room.memory.sources).length; i++) {
                let sourceMem = room.memory.sources[Object.keys(room.memory.sources)[i]];
                if (Game.getObjectById(sourceMem.link)) continue;
                if (sourceMem.linkPos) {
                    let { x, y, roomName } = sourceMem.linkPos;
                    let structures = room.lookForAt(LOOK_STRUCTURES, new RoomPosition(x, y, roomName));
                    if (structures.length && structures[0] instanceof StructureLink) {
                        sourceMem.link = structures[0].id as Id<StructureLink>;
                        continue;
                    }
                }
                if (i == 0 && sourceMem.linkPos) {
                    if (room.controller.level >= 5) {
                        if (!room.lookForAt(LOOK_CONSTRUCTION_SITES, sourceMem.linkPos).length) room.createConstructionSite(sourceMem.linkPos.x, sourceMem.linkPos.y, STRUCTURE_LINK);
                    }
                } else if (i == 1 && sourceMem.linkPos) {
                    if (room.controller.level >= 6) {
                        if (!room.lookForAt(LOOK_CONSTRUCTION_SITES, sourceMem.linkPos).length) room.createConstructionSite(sourceMem.linkPos.x, sourceMem.linkPos.y, STRUCTURE_LINK);
                    }
                }
            }
            for (let id in room.memory.sources) {
                let sourceMem = room.memory.sources[id];
                let source = Game.getObjectById(id as Id<Source>);

                if (room.controller.isPowerEnabled &&
                    (!source.effects || !source.effects.length || source.effects[0].ticksRemaining < 10))
                    PC.addPCTask(roomName, PC.PCTaskName.operate_source, 0, id);

                if (!Game.getObjectById(sourceMem.container)) sourceMem.container = null;
                if (!Game.getObjectById(sourceMem.link)) sourceMem.link = null;
                if (!sourceMem.harvestPos) sourceMem.harvestPos = App.common.getPosNear(source.pos);
                else if (!sourceMem.linkPos) sourceMem.linkPos = App.common.getPosNear(sourceMem.harvestPos);
                if (room.memory.spawns?.length && !sourceMem.harvester) {
                    let creepName = GenNonDuplicateID();
                    App.spawn.run(source.room.name, Role.Harvester, creepName);
                    sourceMem.harvester = creepName;
                    return
                }

                let harvester = Game.creeps[sourceMem.harvester];
                if (!harvester) {
                    App.spawn.run(source.room.name, Role.Harvester, sourceMem.harvester);
                    return;
                }

                if (!harvester.memory.targetSource) harvester.memory.targetSource = id as Id<Source>;

                let link = Game.getObjectById(sourceMem.link);
                let centerLink = Game.getObjectById(room.memory.centerLinkId);
                let controLink = Game.getObjectById(room.memory.controllerLinkId);

                if (link && link.store.energy > 400) {
                    if (controLink && controLink.store.energy < 500 && !link.cooldown) link.transferEnergy(controLink);
                    else if (centerLink && centerLink.store.energy < 400 && !link.cooldown) link.transferEnergy(centerLink);
                }

                // if (link && centerLink) continue;
                
                if (!sourceMem.carrier) {
                    let creepName = GenNonDuplicateID();
                    App.spawn.run(source.room.name, Role.Carrier, creepName);
                    sourceMem.carrier = creepName;
                    return;
                }

                let carrier = Game.creeps[sourceMem.carrier];
                if (!carrier) {
                    App.spawn.run(source.room.name, Role.Carrier, sourceMem.carrier);
                    return;
                }

                if (!carrier.memory.targetContainer && sourceMem.container) carrier.memory.targetContainer = sourceMem.container;

                if (Game.time % 100 == 0 && !room.storage) {
                    let { x, y, roomName } = sourceMem.harvestPos;
                    let resource = room.lookForAt(LOOK_RESOURCES, new RoomPosition(x, y, roomName))[0]
                    if (resource && resource.amount > 500) App.spawn.run(roomName, Role.Builder);
                }
                if (Game.time % 200 == 0) {
                    let { x, y, roomName } = sourceMem.harvestPos;
                    let resource = room.lookForAt(LOOK_RESOURCES, new RoomPosition(x, y, roomName))[0]
                    if (resource && resource.amount > 500) sourceMem.carrier = null;
                }
            }
        }


        // 检测当前房间是否挂载了外矿
        if (!room.memory.outSourceRoomList) room.memory.outSourceRoomList = {};
        if (Object.keys(room.memory.outSourceRoomList).length != 0) {
            for (let roomName in room.memory.outSourceRoomList) {
                let sourceRoom = Game.rooms[roomName];
                if (!room.memory.outSourceRoomList[roomName].reserver) room.memory.outSourceRoomList[roomName] = { reserver : null};
                let reserver = room.memory.outSourceRoomList[roomName].reserver;
                if (!Game.creeps[reserver]) {
                    if (!sourceRoom || sourceRoom.controller.reservation.ticksToEnd < 1000) {
                        let creepName = GenNonDuplicateID();
                        App.spawn.run(room.name, Role.RemoteReserver, creepName);
                        room.memory.outSourceRoomList[roomName].reserver = creepName;
                    }
                } else if (Game.creeps[reserver]) {
                    Game.creeps[reserver].memory.outSourceRoom = roomName;
                }
                if (Game.rooms[roomName] && !room.memory.outSourceRooms[roomName]) {
                    App.common.getOutSources(room.name);
                    console.log(`[${room.name}]外矿[${roomName}]挂载成功`);
                }
            }
        }

        // 判断当前房间是否有外矿，如果有外矿则进行外矿相关的处理
        if (!room.memory.outSourceRooms) room.memory.outSourceRooms = {};
        if (Object.keys(room.memory.outSourceRooms).length != 0) {
            let outSourceRoomName: string;
            for (outSourceRoomName in room.memory.outSourceRooms) {
                if (!Game.rooms[outSourceRoomName]) return;
                for (let id in room.memory.outSourceRooms[outSourceRoomName]) {
                    let sourceMem = room.memory.outSourceRooms[outSourceRoomName][id];
                    let source = Game.getObjectById(id as Id<Source>);
                    let outSourceRoom = Game.rooms[outSourceRoomName];
                    if (!sourceMem.harvestPos) {
                        // 查找source附近是否有container，有container则将container的pos作为开采点
                        let containers = source.pos.findInRange(FIND_STRUCTURES, 3, {
                            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER
                        });
                        if (containers.length > 0) {
                            console.log(`当前房间[${containers[0].pos.roomName}], container[${containers[0].id}]`);
                            sourceMem.harvestPos = new RoomPosition(containers[0].pos.x, containers[0].pos.y, containers[0].pos.roomName);
                        } else {
                            sourceMem.harvestPos = App.common.getPosNear(source.pos);
                        }
                    }
                    if (!Game.getObjectById(sourceMem.container)) {
                        // 在harvestPos创建containerSite
                        let sites = outSourceRoom.lookForAt(LOOK_CONSTRUCTION_SITES, new RoomPosition(sourceMem.harvestPos.x, sourceMem.harvestPos.y, outSourceRoomName));
                        if (!sites.length) outSourceRoom.createConstructionSite(sourceMem.harvestPos.x, sourceMem.harvestPos.y, STRUCTURE_CONTAINER);
                    }


                    // 绑定外矿爬
                    if (room.memory.spawns?.length && !sourceMem.harvester) {
                        let creepName = GenNonDuplicateID();
                        App.spawn.run(room.name, Role.OutHarvester, creepName);
                        sourceMem.harvester = creepName;
                        return;
                    }

                    let harvester = Game.creeps[sourceMem.harvester];
                    if (!harvester) {
                        App.spawn.run(room.name, Role.OutHarvester, sourceMem.harvester);
                        return;
                    }

                    if (!harvester.memory.targetSource) harvester.memory.targetSource = id as Id<Source>;
                    // 绑定外矿爬负责房间
                    if (!harvester.memory.outSourceRoom) harvester.memory.outSourceRoom = outSourceRoomName;
                    // 绑定外矿爬负责的矿点
                    if (!harvester.memory.targetSource) harvester.memory.targetSource = source.id;
                    if (!harvester.memory.targetPos) {

                        let containers = source.pos.findInRange(FIND_STRUCTURES, 3, {
                            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER
                        });
                        if (containers.length > 0) {
                            console.log(`当前房间[${containers[0].pos.roomName}], container[${containers[0].id}]`);
                            harvester.memory.targetPos = new RoomPosition(containers[0].pos.x, containers[0].pos.y, containers[0].pos.roomName);
                        } else {
                            harvester.memory.targetPos = sourceMem.harvestPos;
                        }
                    }

                    // 绑定外矿搬运者
                    if (!sourceMem.carrier) {
                        let creepName = GenNonDuplicateID();
                        App.spawn.run(room.name, Role.RemoteCarryer, creepName);
                        sourceMem.carrier = creepName;
                        return;
                    }

                    let carrier = Game.creeps[sourceMem.carrier];
                    if (!carrier) {
                        App.spawn.run(room.name, Role.RemoteCarryer, sourceMem.carrier);
                        return;
                    }

                    if (!carrier.memory.targetContainer && sourceMem.container) carrier.memory.targetContainer = sourceMem.container;
                    if (!carrier.memory.outSourceRoom) carrier.memory.outSourceRoom = outSourceRoomName;
                }
            }
        }

    }
}