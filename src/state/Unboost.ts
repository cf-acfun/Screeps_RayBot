import App from "@/App";
import Singleton from "@/Singleton";

export default class Unboost extends Singleton {
    public run(creep: Creep) {
        if (creep.room.name != creep.memory.roomFrom) {
            creep.customMove(new RoomPosition(25, 25, creep.memory.roomFrom));
            return;
        }
        if (creep.room.controller.level < 8) creep.suicide();
        else {
            if (!creep.room.memory.unboostContainerPos) creep.suicide();
            else {
                let { x, y, roomName } = creep.room.memory.unboostContainerPos;
                if (!Game.getObjectById(creep.room.memory.unboostContainer)) {
                    let construcure = creep.room.lookForAt(LOOK_STRUCTURES, new RoomPosition(x, y, roomName)).filter(e => e.structureType == STRUCTURE_CONTAINER)
                    if (construcure.length) creep.room.memory.unboostContainer = construcure[0].id as Id<StructureContainer>;
                    else creep.suicide();
                } else {
                    creep.customMove(new RoomPosition(x, y, roomName), 0);
                    if (App.common.getDis(creep.pos, new RoomPosition(x, y, roomName)) == 0) this.unboost(creep);
                }
            }
        }
    }

    public unboost(creep: Creep) {
        // TODO 遍历creep附近的5个lab
        // let labs = creep.room.lookForAtArea(LOOK_STRUCTURES, creep.pos.y - 2, creep.pos.x - 2, creep.pos.y + 2, creep.pos.x + 2, true)
        //     .find(s => s.structure.structureType == STRUCTURE_LAB);
        // console.log(`unboost当前[${creep.room.name}]creep附近的lab为[${JSON.stringify(labs)}]`);
        let lab1 = Game.getObjectById(creep.room.memory.labs[1]);
        if (lab1.cooldown) {
            let lab2 = Game.getObjectById(creep.room.memory.labs[2]);
            if (lab2.cooldown) creep.suicide()
            else lab2.unboostCreep(creep);
        } else lab1.unboostCreep(creep);
        creep.suicide();
    }
}