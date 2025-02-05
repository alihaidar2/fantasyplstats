"use client";

import DifferentialTable from "@/components/differential_table/differential_table";
import ManagerPanel from "@/components/manager_panel/manager_panel";
import Player from "@/types/player";
import { useState } from "react";

const DifferentialPage = () => {
  // ✅ State to store players from each manager
  const [manager1Players, setManager1Players] = useState<Player[]>([]);
  const [manager2Players, setManager2Players] = useState<Player[]>([]);
  return (
    <div className="p-5">
      {/* Single overarching heading */}
      <h1 className="text-2xl font-bold mb-4">FPL Differential Tool</h1>

      <div className="flex justify-between p-5 gap-6">
        {/* Left Panel */}
        <div className="w-1/2">
          <ManagerPanel
            defaultManagerId="3764508"
            title="FPL Differential Tool (Left)"
            onPlayersFetched={setManager1Players} // ✅ Store players in state
          />
        </div>

        {/* Right Panel */}
        <div className="w-1/2">
          <ManagerPanel
            defaultManagerId="1234567"
            title="FPL Differential Tool (Right)"
            onPlayersFetched={setManager2Players} // ✅ Store players in state
          />
        </div>
      </div>

      {/* ✅ Differential Table */}
      <DifferentialTable
        manager1Players={manager1Players}
        manager2Players={manager2Players}
      />
    </div>
  );
};

export default DifferentialPage;
