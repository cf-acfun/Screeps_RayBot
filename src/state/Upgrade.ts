import App from "@/App";
import { Role } from "@/common/Constant";
import { State } from "@/fsm/state";
import Singleton from "@/Singleton";

export default class Upgrade extends Singleton {
    public run(creep: Creep) {
        switch (creep.memory.role) {
            case Role.Builder:
            case Role.Upgrader: {
                let pos = creep.memory.upgradePos;
                let res = creep.upgradeController(creep.room.controller);
                if (res == OK) {
                    if (pos) {
                        creep.customMove(new RoomPosition(pos.x, pos.y, pos.roomName), 0);
                        if (App.common.isPosEqual(creep.pos, pos)) creep.memory.upgradePos = null;
                    }
                }
                if (res == ERR_NOT_IN_RANGE) {
                    if (pos) creep.customMove(new RoomPosition(pos.x, pos.y, pos.roomName), 0, false);
                    else App.common.setUpgradePos(creep.room.name, creep.name);
                }
                if (creep.store.getUsedCapacity() == 0) {
                    creep.memory.targetContainer = null;
                    App.fsm.changeState(creep, State.Withdraw);
                }
                break;
            }
            case Role.HelpUpgrader: {
                let target = Game.flags[`${creep.memory.roomFrom}_helpUpgrade`];
                if (target) {
                    if (creep.room.controller.level == 8) target.remove();
                }
            }
            case Role.HelpBuilder: {
                let pos = creep.memory.upgradePos;
                let res = creep.upgradeController(creep.room.controller);
                if (res == OK) {
                    if (pos) {
                        creep.customMove(new RoomPosition(pos.x, pos.y, pos.roomName), 0);
                        if (App.common.isPosEqual(creep.pos, pos)) creep.memory.upgradePos = null;
                    }
                }
                if (res == ERR_NOT_IN_RANGE) {
                    if (pos) creep.customMove(new RoomPosition(pos.x, pos.y, pos.roomName), 0, false);
                    else App.common.setUpgradePos(creep.room.name, creep.name);
                }

                if (creep.store.getUsedCapacity() == 0) {
                    creep.memory.targetContainer = null;
                    App.fsm.changeState(creep, State.Withdraw);
                }
                break;
            }
        }
    }
}
