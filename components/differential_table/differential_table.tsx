import React from "react";
import Player from "@/types/player";

interface DifferentialTableProps {
  manager1Players: Player[];
  manager2Players: Player[];
}

const DifferentialTable: React.FC<DifferentialTableProps> = ({
  manager1Players,
  manager2Players,
}) => {
  // ✅ Find Differential Players
  const manager1Ids = new Set(manager1Players.map((p) => p.player_id));
  const manager2Ids = new Set(manager2Players.map((p) => p.player_id));

  let uniqueToManager1 = manager1Players.filter(
    (p) => !manager2Ids.has(p.player_id)
  );
  let uniqueToManager2 = manager2Players.filter(
    (p) => !manager1Ids.has(p.player_id)
  );

  let commonPlayers = manager1Players.filter((p) =>
    manager2Ids.has(p.player_id)
  );

  uniqueToManager1 = uniqueToManager1.sort(
    (a, b) => b.total_points - a.total_points
  );
  uniqueToManager2 = uniqueToManager2.sort(
    (a, b) => b.total_points - a.total_points
  );
  commonPlayers = commonPlayers.sort((a, b) => b.total_points - a.total_points);

  return (
    <div className="p-6 bg-gray-100 border border-gray-300 rounded-lg shadow-md mt-6">
      <h2 className="text-xl font-bold text-center mb-4">Differentials</h2>

      <div className="grid grid-cols-3 gap-6 text-center">
        {/* Players Unique to Manager 1 */}
        <div>
          <h3 className="text-lg font-bold text-center mb-2">
            Manager 1 Unique Players
          </h3>
          <ul className="list-disc list-inside flex flex-col items-center">
            {uniqueToManager1.length > 0 ? (
              uniqueToManager1.map((p) => (
                <li key={p.player_id} className="text-gray-700">
                  {p.web_name} - {p.now_cost / 10}M - {p.total_points} pts
                </li>
              ))
            ) : (
              <p className="text-center text-gray-500">No differentials</p>
            )}
          </ul>
        </div>

        {/* Players in Common */}
        <div>
          <h3 className="text-lg font-bold text-center mb-2">Common Players</h3>
          <ul className="list-disc list-inside flex flex-col items-center">
            {commonPlayers.length > 0 ? (
              commonPlayers.map((p) => (
                <li key={p.player_id} className="text-gray-700">
                  {p.web_name} - {p.now_cost / 10}M - {p.total_points} pts
                </li>
              ))
            ) : (
              <p className="text-center text-gray-500">No common players</p>
            )}
          </ul>
        </div>

        {/* Players Unique to Manager 2 */}
        <div>
          <h3 className="text-lg font-bold text-center mb-2">
            Manager 2 Unique Players
          </h3>
          <ul className="list-disc list-inside flex flex-col items-center">
            {uniqueToManager2.length > 0 ? (
              uniqueToManager2.map((p) => (
                <li key={p.player_id} className="text-gray-700">
                  {p.web_name} - {p.now_cost / 10}M - {p.total_points} pts
                </li>
              ))
            ) : (
              <p className="text-center text-gray-500">No differentials</p>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DifferentialTable;
